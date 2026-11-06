const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../notegame-web/js/notes.js'), 'utf8');

function client(fetchImpl, online = true) {
  const effects = { messages: [], storageWrites: 0, closed: 0, reloads: 0, renders: 0 };
  const callbacks = {};
  const elements = {};
  const fields = { noteTitleInput: 'Test note', noteCategoryInput: 'Vật lý', noteContentInput: 'F = ma', noteTagsInput: '' };
  const context = vm.createContext({
    document: { getElementById: id => elements[id] ||= {
      get value() { return fields[id] || ''; }, set value(value) { fields[id] = value; }, style: {}, textContent: ''
    }, querySelector: () => ({ value: '1' }), addEventListener(name, fn) { callbacks[name] = fn; } },
    window: { location: { protocol: 'http:', port: '5000' }, crypto: { randomUUID: () => 'client-test-create-request' } },
    fetch: fetchImpl, console: { warn() {}, error() {} }, confirm: () => true,
    localStorage: { setItem() { effects.storageWrites++; }, getItem() { return null; } }, effects
  });
  vm.runInContext(source, context);
  vm.runInContext(`
    var originalUpdateGamification = updateGamification;
    isMongoConnected = ${online};
    notes = [{id: 'existing', title: 'Original'}];
    showToast = message => effects.messages.push(message);
    closeModal = () => effects.closed++;
    loadNotes = () => effects.reloads++;
    renderNotes = () => effects.renders++;
    updateGamification = () => {};
  `, context);
  return { context, effects, callbacks, fields, elements, run: code => vm.runInContext(code, context) };
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
  const c = client(async url => { requested = url; return { ok: true, json: async () => ({ id: 'created', revision: 0 }) }; });
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
test('uncertain create retries the identical payload/key without creating a second request', async () => {
  const calls = [];
  const c = client(async (url, options) => {
    calls.push(options);
    if (calls.length === 1) throw new Error('response lost after commit');
    return { ok: true, json: async () => ({ id: 'confirmed', revision: 0 }) };
  });
  await c.run('saveNoteFromForm()'); await c.run('saveNoteFromForm()');
  assert.equal(calls[0].headers['Idempotency-Key'], calls[1].headers['Idempotency-Key']);
  assert.equal(calls[0].body, calls[1].body); assert.equal(c.effects.closed, 1);
});
test('draft changed after uncertain create remains open once the original save is confirmed', async () => {
  const calls = [];
  const c = client(async (url, options) => {
    calls.push(options);
    if (calls.length === 1) throw new Error('response lost');
    return { ok: true, json: async () => ({ id: 'confirmed', revision: 0 }) };
  });
  await c.run('saveNoteFromForm()');
  c.fields.noteTitleInput = 'New draft title';
  await c.run('saveNoteFromForm()');
  assert.equal(c.run('editingNoteId'), 'confirmed'); assert.equal(c.run('editingRevision'), 0);
  assert.equal(calls[0].body, calls[1].body);
  assert.equal(c.effects.closed, 0); assert.match(c.effects.messages.at(-1), /Bản nháp mới vẫn mở/);
});
test('online dashboard uses server XP/rewards even when local note count is different', async () => {
  const c = client(async url => ({ ok: true, json: async () => url === '/api/progress'
    ? { totalXp: 250, level: 3, xpInLevel: 25, xpToNextLevel: 125 }
    : { inventory: [{ catalogId: 'starter', quantity: 1 }, { catalogId: 'house', quantity: 1 }] } }));
  c.run('notes = Array(200).fill({id: "local"})');
  assert.equal(await c.run('loadServerProgress()'), true);
  c.run('originalUpdateGamification()');
  assert.equal(c.elements.statLevelNum.textContent, 3);
  assert.match(c.elements.statXpText.textContent, /^250 XP \(25\/150/);
  assert.match(c.elements.godotAssetStatus.textContent, /2 công trình/);
  assert.ok(Math.abs(parseFloat(c.elements.statProgressFill.style.width) - 100 / 6) < 0.01);
});
test('progress failure clears stale dashboard state and never invents XP from notes', async () => {
  const c = client(async () => ({ ok: false, status: 503 }));
  c.run('serverProgress = {totalXp: 500};');
  assert.equal(await c.run('loadServerProgress()'), false);
  c.run('originalUpdateGamification()');
  assert.equal(c.elements.statXpText.textContent, 'XP chưa được xác nhận');
  assert.equal(c.run('notes.length'), 1);
  assert.equal(c.elements.statProgressFill.style.width, '0%');
});
test('online Godot export uses authenticated server data and fails without a fake fallback', async () => {
  const c = client(async url => {
    assert.equal(url, '/api/godot/export');
    return { ok: true, json: async () => ({ totalXp: 20, level: 1, notesCount: 0, notes: [] }) };
  });
  const data = JSON.parse(await c.context.window.GodotBridge.getKnowledgeData());
  assert.equal(data.totalXp, 20); assert.equal(data.notesCount, 0);
  const failed = client(async () => ({ ok: false, status: 503 }));
  await assert.rejects(failed.context.window.GodotBridge.getKnowledgeData(), /Export unavailable/);
});
test('file-mode export marks local notes as prototype without authoritative XP', async () => {
  const c = client(async () => { throw new Error('must not fetch'); }, false);
  c.context.window.location.protocol = 'file:';
  const data = JSON.parse(await c.context.window.GodotBridge.getKnowledgeData());
  assert.equal(data.authoritative, false); assert.equal(data.source, 'offline_prototype');
  assert.equal(data.totalXp, undefined); assert.equal(data.notes.length, 1);
});
