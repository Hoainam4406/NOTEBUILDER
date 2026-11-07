const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../notegame-web/js/journey.js'), 'utf8');
const day = '2026-11-07', stamp = `${day}T12:00:00.000Z`;
const row = (id, title, target = 1) => ({ id, title, description: 'Description <b>literal</b>', target, progress: target, eligible: true, claimedAt: null, href: 'notes.html' });
const data = () => ({ day, resetsAt: '2026-11-08T00:00:00.000Z', achievements: [row('first_note', 'First <b>literal</b>')], quests: [row('daily_note', 'Daily')] });
const error = (status, code) => Object.assign(new Error('private diagnostic'), { status, code });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function client() {
  const elements = {}, events = {}, calls = [], timers = new Set();
  class Element {
    constructor(tag = 'div') { this.tag = tag; this.children = []; this.listeners = {}; this.hidden = true; this.disabled = false; this.textContent = ''; this.attrs = {}; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    addEventListener(type, fn) { this.listeners[type] = fn; }
    setAttribute(key, value) { this.attrs[key] = value; }
    set innerHTML(_value) { throw new Error('Never render HTML'); }
    focus() { c.focus = this; }
  }
  const c = { elements, events, calls, timers, owner: 'owner', data: data(), mutate: null, read: null };
  const request = async (url, options = {}) => {
    calls.push({ url, ...(options.method ? { method: options.method, body: options.body } : {}) });
    if (url === '/api/auth/me') return { user: { id: c.owner } };
    if (options.method) {
      if (c.mutate) return c.mutate(url, options);
      const kind = url.includes('/quests/') ? 'quest' : 'achievement', id = url.split('/').at(-1);
      c.data[kind === 'quest' ? 'quests' : 'achievements'].find(item => item.id === id).claimedAt = stamp;
      return { claim: { id, kind, period: kind === 'quest' ? day : 'lifetime', claimedAt: stamp }, replayed: false };
    }
    if (url === '/api/journey') return c.read ? c.read() : structuredClone(c.data);
    assert.fail(url);
  };
  vm.runInNewContext(source, { document: { hidden: false, getElementById: id => elements[id] ||= new Element(), createElement: tag => new Element(tag), addEventListener(type, fn) { events[type] = fn; } },
    window: { KnowledgeAuth: { request }, addEventListener(type, fn) { events[type] = fn; }, location: { reload() { c.reloaded = true; } } }, AbortController,
    setTimeout(fn) { timers.add(fn); return fn; }, clearTimeout(fn) { timers.delete(fn); } });
  c.flush = () => new Promise(resolve => setImmediate(resolve));
  c.click = name => elements[name].listeners.click();
  c.card = (kind = 'achievement') => elements[kind === 'quest' ? 'questList' : 'achievementList'].children[0];
  c.button = (kind = 'achievement') => c.card(kind).children.find(child => child.tag === 'button');
  c.claim = kind => c.button(kind).listeners.click();
  c.writes = () => calls.filter(call => call.method);
  await c.flush(); return c;
}
test('journey renders literal titles/progress and only sends the stable claim resource, not counters or XP', async () => {
  const c = await client();
  assert.equal(c.elements.journeyContent.hidden, false); assert.equal(c.card().children[0].textContent, 'First <b>literal</b>');
  assert.equal(c.card().children[2].value, 1); await c.claim();
  assert.deepEqual(c.writes()[0], { url: '/api/journey/achievements/first_note', method: 'PUT', body: '{}' });
  assert.equal(c.button().disabled, true); assert.match(c.card().children[3].textContent, /Đã nhận/);
  assert.equal(c.focus, c.elements.journeyStatus);
});
test('uncertain claim keeps exact path/body, locks edits and never invents a badge before confirmation', async () => {
  for (const failure of [error(503, 'DATABASE_UNAVAILABLE'), new Error('network'), null]) {
    const c = await client(); c.mutate = async () => { if (failure) throw failure; return {}; };
    await c.claim('quest'); const original = c.writes()[0];
    assert.equal(c.elements.retryJourney.hidden, false); assert.equal(c.elements.refreshJourney.disabled, true);
    assert.equal(c.focus, c.elements.retryJourney);
    assert.doesNotMatch(c.card('quest').children[3].textContent, /Đã nhận/);
    await c.claim(); await c.click('refreshJourney'); assert.equal(c.writes().length, 1);
    c.mutate = null; await c.click('retryJourney'); assert.deepEqual(c.writes()[1], original);
    assert.deepEqual(JSON.parse(original.body), { day }); assert.equal(c.elements.retryJourney.hidden, true);
  }
});
test('day conflict refreshes current server day and never automatically claims a new quest period', async () => {
  const c = await client(); c.data.day = '2026-11-08'; c.data.resetsAt = '2026-11-09T00:00:00.000Z';
  c.mutate = async () => { throw error(409, 'QUEST_DAY_CHANGED'); }; await c.claim('quest');
  assert.equal(c.writes().length, 1); assert.match(c.elements.journeyDay.textContent, /2026-11-08/);
  assert.match(c.elements.journeyStatus.textContent, /không tự nhận/); assert.equal(c.elements.retryJourney.hidden, true);
});
test('a confirmed PUT followed by a failed GET remains claimed and does not retain an uncertain mutation', async () => {
  const c = await client(); c.read = async () => { throw error(503, 'DATABASE_UNAVAILABLE'); };
  await c.claim(); assert.equal(c.writes().length, 1); assert.match(c.elements.journeyStatus.textContent, /Đã nhận.*Chưa tải/);
  assert.equal(c.elements.retryJourney.hidden, true); assert.match(c.card().children[3].textContent, /Đã nhận/);
  await c.claim(); assert.equal(c.writes().length, 1);
});
test('owner switch on retry and auth expiry clear private progress without writing under a new account', async () => {
  for (const mode of ['changed', 'expired']) {
    const c = await client(); c.mutate = async () => { throw mode === 'expired' ? error(401, 'AUTH_REQUIRED') : new Error('lost response'); };
    await c.claim(); if (mode === 'changed') { c.owner = 'other'; await c.click('retryJourney'); }
    assert.equal(c.writes().length, 1); assert.equal(c.elements.journeyContent.hidden, true); assert.equal(c.elements.journeyLogin.hidden, false);
    assert.equal(c.elements.questList.children.length, 0); assert.equal(c.elements.achievementList.children.length, 0);
  }
});
test('timeout preserves original claim for retry and pagehide suppresses a late successful UI update', async () => {
  const c = await client(), started = deferred();
  c.mutate = (_url, options) => new Promise((_resolve, reject) => { options.signal.addEventListener('abort', () => reject(new Error('timeout'))); started.resolve(); });
  const writing = c.claim(); await started.promise; for (const timer of c.timers) timer(); await writing;
  assert.equal(c.elements.retryJourney.hidden, false); c.mutate = null; await c.click('retryJourney'); assert.deepEqual(c.writes()[0], c.writes()[1]);
  const late = await client(), wait = deferred(), ready = deferred();
  late.mutate = () => { ready.resolve(); return wait.promise; };
  const pending = late.claim(); await ready.promise; late.events.pagehide();
  wait.resolve({ claim: { id: 'first_note', kind: 'achievement', period: 'lifetime', claimedAt: stamp } }); await pending;
  assert.doesNotMatch(late.elements.journeyStatus.textContent, /Đã nhận:/);
  late.events.pageshow({ persisted: true }); assert.equal(late.reloaded, true);
});
test('a bad dashboard link is rejected and visibility refresh never retries a pending claim automatically', async () => {
  const c = await client(); c.data.achievements[0].href = 'javascript:alert(1)';
  await c.click('refreshJourney'); assert.match(c.elements.journeyStatus.textContent, /Chưa tải/);
  c.mutate = async () => { throw new Error('uncertain'); }; await c.claim();
  await c.events.visibilitychange(); assert.equal(c.writes().length, 1);
});
