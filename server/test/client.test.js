const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../notegame-web/js/notes.js'), 'utf8');

function client(fetchImpl, online = true) {
  const effects = { messages: [], storageWrites: 0, closed: 0, reloads: 0, renders: 0 };
  const callbacks = {};
  const fields = { noteTitleInput: 'Test note', noteCategoryInput: 'Vật lý', noteContentInput: 'F = ma', noteTagsInput: '' };
  const context = vm.createContext({
    document: { getElementById: id => ({ value: fields[id] || '' }), querySelector: () => ({ value: '1' }), addEventListener(name, fn) { callbacks[name] = fn; } },
    window: { location: { protocol: 'http:', port: '5000' } },
    fetch: fetchImpl, console: { warn() {}, error() {} }, confirm: () => true,
    localStorage: { setItem() { effects.storageWrites++; }, getItem() { return null; } }, effects
  });
  vm.runInContext(source, context);
  vm.runInContext(`
    isMongoConnected = ${online};
    notes = [{id: 'existing', title: 'Original'}];
    showToast = message => effects.messages.push(message);
    closeModal = () => effects.closed++;
    loadNotes = () => effects.reloads++;
    renderNotes = () => effects.renders++;
    updateGamification = () => {};
  `, context);
  return { context, effects, callbacks, run: code => vm.runInContext(code, context) };
}
for (const [label, fetchImpl] of [
  ['HTTP 400', async () => ({ ok: false, status: 400 })],
  ['HTTP 500', async () => ({ ok: false, status: 500 })],
  ['network failure', async () => { throw new Error('offline'); }]
]) {
  test(`save retains editor and data after ${label}`, async () => {
    const c = client(fetchImpl);
    await c.run('saveNoteFromForm()');
    assert.equal(c.effects.closed, 0);
    assert.equal(c.effects.storageWrites, 0);
    assert.equal(c.run('notes.length'), 1);
    assert.match(c.effects.messages[0], /Chưa xác nhận lưu/);
  });
  test(`delete retains list after ${label}`, async () => {
    const c = client(fetchImpl);
    await c.run("window.deleteNote('existing')");
    assert.equal(c.effects.storageWrites, 0);
    assert.equal(c.run('notes.length'), 1);
    assert.match(c.effects.messages[0], /Chưa xác nhận xóa/);
  });
}
test('online save uses same origin, confirms success and closes editor', async () => {
  let requested;
  const c = client(async url => { requested = url; return { ok: true }; });
  await c.run('saveNoteFromForm()');
  assert.equal(requested, '/api/notes');
  assert.equal(c.effects.closed, 1);
  assert.equal(c.effects.reloads, 1);
  assert.equal(c.effects.storageWrites, 0);
});
test('online update failure preserves original note', async () => {
  const c = client(async () => ({ ok: false }));
  c.run("editingNoteId = 'existing'");
  await c.run('saveNoteFromForm()');
  assert.equal(c.run('notes[0].title'), 'Original');
  assert.equal(c.effects.closed, 0);
});
test('offline editing remains explicitly local', async () => {
  const c = client(async () => { throw new Error('must not fetch'); }, false);
  await c.run('saveNoteFromForm()');
  assert.equal(c.effects.storageWrites, 1);
  assert.equal(c.run('notes.length'), 2);
  assert.equal(c.effects.closed, 1);
});
test('update sends the editor revision through authenticated fetch', async () => {
  let sent;
  const c = client(async () => { throw new Error('must use auth wrapper'); });
  c.context.window.KnowledgeAuth = { fetch: async (url, options) => { sent = JSON.parse(options.body); return { ok: true }; } };
  c.run("editingNoteId = 'existing'; editingRevision = 7");
  await c.run('saveNoteFromForm()');
  assert.equal(sent.revision, 7); assert.equal(c.effects.closed, 1);
});
test('conflicting save keeps the draft open and does not replace revision', async () => {
  const c = client(async () => ({ ok: false, status: 409 }));
  c.run("editingNoteId = 'existing'; editingRevision = 2");
  await c.run('saveNoteFromForm()');
  assert.equal(c.effects.closed, 0); assert.equal(c.run('editingRevision'), 2);
  assert.equal(c.effects.storageWrites, 0); assert.match(c.effects.messages[0], /xung đột/);
});
test('conflicting delete preserves list and sends observed revision', async () => {
  let sent;
  const c = client(async (url, options) => { sent = JSON.parse(options.body); return { ok: false, status: 409 }; });
  c.run('notes[0].revision = 3');
  await c.run("window.deleteNote('existing')");
  assert.equal(sent.revision, 3); assert.equal(c.run('notes.length'), 1);
  assert.equal(c.effects.reloads, 0); assert.equal(c.effects.storageWrites, 0);
});
test('served startup redirects anonymous users without loading local notes', async () => {
  const c = client(async () => { throw new Error('must not fetch notes'); });
  c.context.window.KnowledgeAuth = { me: async () => { throw Object.assign(new Error(), { status: 401 }); } };
  c.run('setupEventListeners = () => {};');
  await c.callbacks.DOMContentLoaded();
  assert.equal(c.context.window.location.href, 'account.html');
  assert.equal(c.effects.reloads, 0); assert.equal(c.effects.storageWrites, 0);
});
test('served startup with DB failure retains server mode without local fallback/import', async () => {
  const c = client(async () => { throw new Error('must not fetch'); });
  c.context.window.KnowledgeAuth = { me: async () => ({ user: { id: 'A' } }) };
  c.run('setupEventListeners = () => {}; checkDatabaseConnection = async () => { isMongoConnected = false; }; autoMigrateLocalStorage = () => { throw new Error("must not import"); };');
  await c.callbacks.DOMContentLoaded();
  assert.equal(c.run('isMongoConnected'), true);
  assert.equal(c.effects.reloads, 1); assert.equal(c.effects.storageWrites, 0);
});
