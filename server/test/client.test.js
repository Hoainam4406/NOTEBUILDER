const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../notegame-web/js/notes.js'), 'utf8');

function client(fetchImpl, online = true) {
  const effects = { messages: [], storageWrites: 0, closed: 0, reloads: 0, renders: 0 };
  const fields = { noteTitleInput: 'Test note', noteCategoryInput: 'Vật lý', noteContentInput: 'F = ma', noteTagsInput: '' };
  const context = vm.createContext({
    document: { getElementById: id => ({ value: fields[id] || '' }), querySelector: () => ({ value: '1' }), addEventListener() {} },
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
  return { context, effects, run: code => vm.runInContext(code, context) };
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
