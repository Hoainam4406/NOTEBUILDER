const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../notegame-web/js/review.js'), 'utf8');
const id = '0123456789abcdef01234567';
const noteIds = ['0123456789abcdef01234568', '0123456789abcdef01234569'];
const snapshot = (nextIndex = 0, status = 'active') => ({ id, status, revision: nextIndex, nextIndex,
  cards: noteIds.map((noteId, i) => ({ noteId, noteRevision: 0, question: status === 'active' ? `Lesson ${i + 1} <b>literal</b>` : '',
    answer: status === 'active' ? `Private answer ${i + 1}` : '', rating: i < nextIndex ? 'remembered' : null, reviewedAt: i < nextIndex ? '2026-11-07T00:00:00Z' : null })) });
const apiError = (status, code) => Object.assign(new Error('private server diagnostic'), { status, code });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function client(active = true) {
  const elements = {}, events = {}, calls = [], timers = new Set(); let key = 0, focused = null;
  class Element {
    constructor(tag = 'div') { this.tag = tag; this.children = []; this.listeners = {}; this.hidden = true; this.disabled = false; this.textContent = ''; this.attrs = {}; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    querySelectorAll(tag) { return this.children.flatMap(child => [...(child.tag === tag ? [child] : []), ...child.querySelectorAll(tag)]); }
    addEventListener(type, fn) { this.listeners[type] = fn; }
    setAttribute(key, value) { this.attrs[key] = value; }
    set innerHTML(_value) { throw new Error('Never render note content as HTML'); }
    focus() { focused = this; }
  }
  const c = { elements, events, calls, timers, owner: 'owner', current: active ? snapshot() : null, response: snapshot(1), mutation: null };
  const request = async (url, options = {}) => {
    calls.push({ url, ...(options.method ? { method: options.method, body: options.body, headers: { ...options.headers } } : {}) });
    if (url === '/api/auth/me') return { user: { id: c.owner } };
    if (options.method) return c.mutation ? c.mutation(url, options) : { session: c.response, replayed: false };
    if (url === '/api/reviews/notes') return { notes: noteIds.map((noteId, i) => ({ id: noteId, title: `Lesson ${i + 1}`, category: 'Subject' })) };
    if (url === '/api/reviews') return { active: c.current, recent: [] };
    if (url === `/api/reviews/${id}`) return { session: c.current };
    assert.fail(url);
  };
  const context = vm.createContext({ document: { getElementById: name => elements[name] ||= new Element(), createElement: tag => new Element(tag) },
    window: { KnowledgeAuth: { request }, addEventListener(type, fn) { events[type] = fn; }, location: { reload() { c.reloaded = true; } } },
    crypto: { randomUUID: () => `test-review-request-${++key}` }, AbortController,
    setTimeout(fn) { timers.add(fn); return fn; }, clearTimeout(fn) { timers.delete(fn); } });
  vm.runInContext(source, context);
  c.flush = () => new Promise(resolve => setImmediate(resolve));
  c.click = name => elements[name].listeners.click();
  c.select = value => { const input = elements.noteChoices.querySelectorAll('input').find(node => node.value === value); input.checked = true; input.listeners.change(); };
  c.start = () => elements.reviewSetup.listeners.submit({ preventDefault() {} });
  c.writes = () => calls.filter(call => call.method);
  c.focused = () => focused;
  await c.flush(); return c;
}

test('flashcard uses literal text, hides answer until reveal and never grades before self-review', async () => {
  const c = await client();
  assert.equal(c.elements.sessionPanel.hidden, false); assert.match(c.elements.cardQuestion.textContent, /<b>literal<\/b>/);
  assert.equal(c.elements.cardAnswer.hidden, true); assert.equal(c.elements.rateRemembered.disabled, true);
  await c.click('rateRemembered'); assert.equal(c.writes().length, 0);
  c.click('revealAnswer'); assert.equal(c.elements.cardAnswer.textContent, 'Private answer 1'); assert.equal(c.elements.rateAgain.disabled, false);
  assert.equal(c.elements.revealAnswer.hidden, false); assert.equal(c.elements.revealAnswer.attrs['aria-expanded'], 'true');
  c.click('revealAnswer'); assert.equal(c.elements.cardAnswer.hidden, true); assert.equal(c.elements.rateAgain.disabled, true);
  c.click('revealAnswer');
  await c.click('rateRemembered');
  assert.equal(c.writes()[0].url, `/api/reviews/${id}/answers`);
  assert.deepEqual(JSON.parse(c.writes()[0].body), { cardIndex: 0, rating: 'remembered', revision: 0 });
  assert.match(c.elements.cardQuestion.textContent, /Lesson 2/); assert.equal(c.elements.cardAnswer.hidden, true);
  assert.equal(c.focused(), c.elements.cardQuestion);
});
test('starting a session sends only selected IDs and gets its snapshot from the server', async () => {
  const c = await client(false); c.response = snapshot();
  assert.equal(c.elements.reviewSetup.hidden, false); assert.equal(c.elements.startReview.disabled, true);
  c.select(noteIds[1]); c.select(noteIds[0]); await c.start();
  assert.equal(c.writes()[0].url, '/api/reviews'); assert.deepEqual(JSON.parse(c.writes()[0].body), { noteIds: [noteIds[1], noteIds[0]] });
  assert.equal(c.elements.sessionPanel.hidden, false); assert.equal(c.elements.reviewSetup.hidden, true);
  assert.ok(c.elements.noteChoices.querySelectorAll('input').every(input => !input.checked));
});
test('uncertain rating preserves request, choice and old card until explicit identical retry succeeds', async () => {
  for (const error of [apiError(503, 'DATABASE_UNAVAILABLE'), new Error('network failed'), null]) {
    const c = await client(); c.mutation = async () => { if (error) throw error; return {}; };
    c.click('revealAnswer'); await c.click('rateAgain');
    const original = c.writes()[0];
    assert.equal(c.elements.retryReview.hidden, false); assert.equal(c.elements.rateAgain.disabled, true); assert.equal(c.elements.refreshReview.disabled, true);
    assert.match(c.elements.cardQuestion.textContent, /Lesson 1/); assert.equal(c.elements.ratingDraft.hidden, false);
    await c.click('rateRemembered'); await c.click('refreshReview'); assert.equal(c.writes().length, 1);
    c.mutation = null; await c.click('retryReview');
    assert.deepEqual(c.writes()[1], original); assert.match(c.elements.cardQuestion.textContent, /Lesson 2/);
    assert.equal(c.elements.retryReview.hidden, true); assert.equal(c.elements.ratingDraft.hidden, true);
    assert.doesNotMatch(c.elements.reviewStatus.textContent, /private|network/);
  }
});
test('conflict reloads current card while preserving unconfirmed rating without automatically resubmitting it', async () => {
  const c = await client(); c.current = snapshot(1); c.mutation = async () => { throw apiError(409, 'REVIEW_CONFLICT'); };
  c.click('revealAnswer'); await c.click('rateRemembered');
  assert.equal(c.writes().length, 1); assert.match(c.elements.cardQuestion.textContent, /Lesson 2/);
  assert.equal(c.elements.cardAnswer.hidden, true); assert.equal(c.elements.ratingDraft.hidden, false);
  assert.match(c.elements.ratingDraft.textContent, /thẻ 1/); assert.match(c.elements.reviewStatus.textContent, /tab khác/);
});
test('session expiry or owner change on retry clears private content and never writes under the new account', async () => {
  for (const mode of ['expired', 'changed']) {
    const c = await client(); c.click('revealAnswer');
    c.mutation = async () => { throw mode === 'expired' ? apiError(401, 'AUTH_REQUIRED') : new Error('lost response'); };
    await c.click('rateAgain'); const writes = c.writes().length;
    if (mode === 'changed') { c.owner = 'other'; await c.click('retryReview'); }
    assert.equal(c.elements.sessionPanel.hidden, true); assert.equal(c.elements.loginLink.hidden, false);
    assert.equal(c.elements.cardQuestion.textContent, ''); assert.equal(c.elements.cardAnswer.textContent, '');
    await c.click('retryReview'); assert.equal(c.writes().length, writes);
  }
});
test('completed/closed state shows authoritative summary and history without inventing XP', async () => {
  const c = await client(); c.response = { ...snapshot(1, 'closed'), revision: 2 };
  await c.click('closeReview');
  assert.deepEqual(JSON.parse(c.writes()[0].body), { revision: 0 });
  assert.equal(c.elements.reviewSummary.hidden, false); assert.match(c.elements.summaryText.textContent, /1\/2/);
  assert.equal(c.elements.reviewHistory.hidden, false); assert.equal(c.elements.historyList.children.length, 1);
  assert.match(c.elements.reviewStatus.textContent, /XP.*không đổi/);
});
test('a timed-out write can be retried with its original key/body and no optimistic progress', async () => {
  const c = await client(); const started = deferred();
  c.mutation = (_url, options) => new Promise((_resolve, reject) => { options.signal.addEventListener('abort', () => reject(new Error('aborted'))); started.resolve(); });
  c.click('revealAnswer'); const writing = c.click('rateAgain'); await started.promise;
  for (const timer of c.timers) timer(); await writing;
  assert.match(c.elements.cardQuestion.textContent, /Lesson 1/); assert.equal(c.elements.retryReview.hidden, false);
  c.mutation = null; await c.click('retryReview'); assert.deepEqual(c.writes()[0], c.writes()[1]);
});
test('pagehide aborts pending activity and suppresses late UI success; cached return reloads', async () => {
  const c = await client(); const delayed = deferred(), started = deferred();
  c.mutation = () => { started.resolve(); return delayed.promise; };
  c.click('revealAnswer'); const writing = c.click('rateAgain'); await started.promise;
  c.events.pagehide(); delayed.resolve({ session: snapshot(2, 'completed') }); await writing;
  assert.match(c.elements.cardQuestion.textContent, /Lesson 1/); assert.equal(c.elements.reviewSummary.hidden, true);
  c.events.pageshow({ persisted: true }); assert.equal(c.reloaded, true);
});
