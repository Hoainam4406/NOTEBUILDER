const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../notegame-web/js/editor-drafts.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const fail = (status, code) => Object.assign(new Error('private diagnostic'), { status, code });
function client() {
  const c = { state: { noteId: null, baseRevision: null, fields: { title: 'Title', category: 'Subject', content: 'Body', tags: '', template: '1', canvasJSON: '{"objects":[{"type":"text","text":"Remember"}]}' } },
    records: new Map(), calls: [], events: {}, timers: new Map(), messages: [], owner: 'A', note: null, draftFault: null, noteFault: null, expired: false };
  let id = 0, timerId = 0;
  c.request = async (url, options = {}) => {
    c.calls.push({ url, method: options.method, body: options.body, headers: options.headers });
    if (url === '/api/auth/me') return { user: { id: c.owner } };
    if (url === '/api/drafts') return { drafts: [...c.records.values()].map(r => ({ id: r.id, revision: r.revision, title: r.data.fields.title })) };
    if (url.startsWith('/api/drafts/')) {
      const key = url.split('/').at(-1), value = options.body && JSON.parse(options.body);
      if (options.method === 'PUT') {
        const old = c.records.get(key);
        if (c.draftFault) return c.draftFault(url, options);
        if (old && old.revision !== value.revision) {
          if (old.revision === value.revision + 1 && JSON.stringify(old.data) === JSON.stringify(value.data)) return { draft: clone(old), replayed: true };
          throw fail(409, 'DRAFT_CONFLICT');
        }
        const record = { id: key, revision: value.revision + 1, data: value.data }; c.records.set(key, record); return { draft: clone(record) };
      }
      if (options.method === 'DELETE') { c.records.delete(key); return null; }
      return { draft: clone(c.records.get(key)) };
    }
    if (url.startsWith('/api/notes')) {
      if (c.noteFault) return c.noteFault(url, options);
      if (!options.method) return clone(c.note);
      const body = JSON.parse(options.body); c.note = { ...body, id: '0123456789abcdef01234567', revision: options.method === 'POST' ? 0 : body.revision + 1 };
      return clone(c.note);
    }
    assert.fail(url);
  };
  const context = { window: { KnowledgeAuth: { request: (...args) => c.request(...args) }, addEventListener(name, fn) { c.events[name] = fn; }, location: { reload() { c.reloaded = true; } } },
    crypto: { randomUUID: () => `draft-${++id}` }, AbortController,
    setTimeout(fn, delay) { c.timers.set(++timerId, { fn, delay }); return timerId; }, clearTimeout(key) { c.timers.delete(key); } };
  vm.runInNewContext(source, context);
  c.app = context.window.EditorDrafts.create({ ownerId: 'A', getState: () => clone(c.state), status: text => c.messages.push(text),
    onPublished(note) { c.state.noteId = note.id; c.state.baseRevision = note.revision; },
    onRestore(record) { c.state = { noteId: record.data.noteId, baseRevision: record.data.baseRevision, fields: clone(record.data.fields) }; c.app.attach(record); },
    onList(rows) { c.list = rows; }, onExpire() { c.expired = true; } });
  c.app.attach();
  c.payload = () => ({ title: c.state.fields.title, content: c.state.fields.content, canvasJSON: c.state.fields.canvasJSON });
  c.writes = prefix => c.calls.filter(call => call.url.startsWith(prefix) && ['PUT', 'POST'].includes(call.method));
  return c;
}
test('draft timer saves raw fields/canvas without publishing a note; restore needs explicit selection', async () => {
  const c = client(); c.app.changed(); assert.ok([...c.timers.values()].some(t => t.delay === 1000));
  await c.app.flush(); assert.equal(c.writes('/api/notes').length, 0); assert.equal(c.app.dirty(), false);
  const stored = [...c.records.values()][0]; assert.equal(stored.data.fields.canvasJSON, c.state.fields.canvasJSON);
  c.app.detach(); c.state.fields.title = 'Different'; await c.app.restore(stored.id);
  assert.equal(c.state.fields.title, 'Title'); assert.equal(c.state.fields.canvasJSON, stored.data.fields.canvasJSON);
});
test('an uncertain draft CAS write is retried byte-for-byte before newer edits are saved', async () => {
  const c = client(); c.draftFault = async () => { throw new Error('Lost response'); };
  await assert.rejects(c.app.flush()); const old = c.writes('/api/drafts')[0];
  c.state.fields.title = 'New input'; c.draftFault = null; await c.app.flush();
  assert.equal(c.writes('/api/drafts')[1].body, old.body);
  assert.equal([...c.records.values()][0].data.fields.title, 'New input'); assert.equal(c.app.dirty(), false);
});
test('malformed draft success is treated as uncertain and retains the original CAS request', async () => {
  const c = client(); c.draftFault = async () => ({ draft: { id: 'draft-1', revision: 1 } });
  await assert.rejects(c.app.flush()); const sent = c.writes('/api/drafts')[0];
  c.draftFault = null; await c.app.flush(); assert.equal(c.writes('/api/drafts')[1].body, sent.body);
});
test('pending note create is persisted before POST and survives restore with the same key/payload', async () => {
  const c = client(); c.noteFault = async () => { throw new Error('Committed but response lost'); };
  await assert.rejects(c.app.publish(c.payload()));
  const old = c.writes('/api/notes')[0], stored = clone([...c.records.values()][0]);
  assert.ok(stored.data.pending.key); assert.equal(c.calls.findIndex(r => r.method === 'PUT'), c.calls.findIndex(r => r.url.startsWith('/api/drafts/') && r.method === 'PUT'));
  c.app.attach(stored); c.noteFault = null; await c.app.publish(c.payload());
  const replay = c.writes('/api/notes')[1]; assert.equal(replay.body, old.body); assert.equal(replay.headers['Idempotency-Key'], old.headers['Idempotency-Key']);
  assert.equal(c.records.size, 0);
});
test('typing during a publish keeps the new draft open with the confirmed note revision', async () => {
  const c = client(); c.noteFault = async () => {
    c.state.fields.title = 'Typed while saving'; return { id: '0123456789abcdef01234567', revision: 0 };
  };
  assert.equal(await c.app.publish(c.payload()), false);
  assert.equal(c.state.baseRevision, 0); assert.equal(c.state.fields.title, 'Typed while saving');
  const saved = [...c.records.values()][0].data; assert.equal(saved.noteId, c.state.noteId); assert.equal(saved.pending, null);
});
test('lost PUT response is confirmed only at revision+1 with matching payload, never overwriting a changed note', async () => {
  for (const matches of [true, false]) {
    const c = client(); c.state.noteId = '0123456789abcdef01234567'; c.state.baseRevision = 3;
    c.noteFault = async (_url, options) => { if (options.method) throw fail(409, 'NOTE_CONFLICT'); return { ...c.payload(), id: c.state.noteId, revision: matches ? 4 : 5 }; };
    if (matches) assert.equal(await c.app.publish(c.payload()), true);
    else { await assert.rejects(c.app.publish(c.payload())); assert.ok([...c.records.values()][0].data.pending); }
    assert.equal(c.writes('/api/notes').length, 1);
  }
});
test('draft conflict stops automatic overwrite; owner change clears private state and prevents publish', async () => {
  const c = client(); c.draftFault = async () => { throw fail(409, 'DRAFT_CONFLICT'); };
  await assert.rejects(c.app.flush()); await assert.rejects(c.app.publish(c.payload())); assert.equal(c.writes('/api/notes').length, 0);
  c.owner = 'B'; await assert.rejects(c.app.flush()); assert.equal(c.expired, true);
  const other = client(); await other.app.flush(); other.owner = 'B'; await assert.rejects(other.app.publish(other.payload()));
  assert.equal(other.expired, true); assert.equal(other.writes('/api/notes').length, 0);
});
test('pagehide aborts in-flight autosave and suppresses late success, beforeunload warns only for dirty drafts', async () => {
  const c = client(); let prevented = 0;
  c.events.beforeunload({ preventDefault() { prevented++; } }); assert.equal(prevented, 0);
  c.app.changed();
  c.events.beforeunload({ preventDefault() { prevented++; } }); assert.equal(prevented, 1);
  await c.app.flush(); c.events.beforeunload({ preventDefault() { prevented++; } }); assert.equal(prevented, 1);
  let finish, started; const ready = new Promise(resolve => { started = resolve; });
  c.state.fields.title = 'New'; c.draftFault = (_url, options) => new Promise(resolve => { finish = resolve; c.signal = options.signal; started(); });
  const writing = c.app.flush(); await ready; c.events.pagehide(); assert.equal(c.signal.aborted, true);
  const count = c.messages.length; finish({ draft: { id: 'draft-1', revision: 2, data: { ...c.state, pending: null } } }); await writing;
  assert.equal(c.messages.length, count); c.events.pageshow({ persisted: true }); assert.equal(c.reloaded, true);
});
test('definitive invalid-draft errors allow corrected input to be saved instead of retrying rejected bytes forever', async () => {
  const c = client(); c.draftFault = async () => { throw fail(400, 'INVALID_INPUT'); }; await assert.rejects(c.app.flush());
  c.draftFault = null; c.state.fields.title = 'Corrected'; await c.app.flush();
  assert.equal([...c.records.values()][0].data.fields.title, 'Corrected');
});
