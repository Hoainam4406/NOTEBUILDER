const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');
const { fork } = require('node:child_process');
const path = require('node:path');
const { createApp } = require('../../app');
const { createProgression, ensureProgressionDatabase } = require('../../progression');
const { startTestDatabase } = require('../helpers/mongo');
const User = require('../../models/User');
const Note = require('../../models/Note');
const Progress = require('../../models/Progress');
const XpEvent = require('../../models/XpEvent');
const XpFingerprint = require('../../models/XpFingerprint');
const Unlock = require('../../models/Unlock');
const Inventory = require('../../models/Inventory');
const Session = require('../../models/Session');
const AuthAttempt = require('../../models/AuthAttempt');
let database, server, base, child, childBase, failAt, clock;
const models = [User, Note, Progress, XpEvent, XpFingerprint, Unlock, Inventory, Session, AuthAttempt];
before(async () => {
  database = await startTestDatabase();
  await ensureProgressionDatabase();
  server = createApp({ logger: { error() {} }, progression: createProgression({ now: () => new Date(clock), afterWrite(stage) {
    if (stage === failAt) throw new Error('Injected transaction failure');
  } }) }).listen(0, '127.0.0.1');
  await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`;
  child = fork(path.join(__dirname, '../helpers/api-process.js'), [], {
    env: { ...process.env, NODE_ENV: 'test', KC_TEST_MONGO_URI: database.uri }, stdio: ['ignore', 'inherit', 'inherit', 'ipc']
  });
  const [message] = await once(child, 'message'); assert.ok(message.port); childBase = `http://127.0.0.1:${message.port}`;
}, { timeout: 240000 });
beforeEach(async () => { failAt = null; clock = Date.now(); await Promise.all(models.map(model => model.deleteMany({}))); });
after(async () => {
  if (child?.exitCode === null) { const stopped = once(child, 'exit'); child.send('stop'); await stopped; }
  if (server) await new Promise(resolve => server.close(resolve));
  await database?.stop();
});
const password = 'secure student password 123';
const content = 'Một ghi chú kiến thức có cấu trúc giải thích quy tắc, ví dụ và ứng dụng vào bài tập thực tế. ';
async function request(url, method = 'GET', body, login, key = randomUUID(), origin = base) {
  const response = await fetch(origin + url, { method,
    headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}),
      ...(login ? { Cookie: login.cookie, 'X-CSRF-Token': login.csrfToken } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, headers: response.headers, body: response.status === 204 ? null : await response.json() };
}
async function account(email = 'student@example.com') {
  assert.equal((await request('/api/auth/register', 'POST', { email, password, displayName: 'Student' })).status, 201);
  const response = await request('/api/auth/login', 'POST', { email, password });
  assert.equal(response.status, 200);
  return { cookie: response.headers.get('set-cookie').split(';')[0], ...response.body };
}
test('XP-01 note + ledger + starter inventory commit together and reject missing request keys', async () => {
  const login = await account();
  assert.equal((await request('/api/notes', 'POST', { title: 'Lesson', content }, login, null)).status, 400);
  assert.equal(await Note.countDocuments(), 0);
  const saved = await request('/api/notes', 'POST', { title: 'Lesson', content, totalXp: 999999 }, login);
  assert.equal(saved.status, 201);
  assert.equal((await XpEvent.findOne()).amount, 20);
  assert.equal((await Progress.findOne()).totalXp, 20);
  assert.equal((await Inventory.findOne()).quantity, 1);
  assert.equal((await Unlock.findOne()).rewardId, 'starter_apartment');
  assert.equal((await request('/api/progress', 'GET', undefined, login)).body.totalXp, 20);
});
test('XP-02/RWD-02 simultaneous same-key requests across processes replay one note and reward', async () => {
  const login = await account(); const key = randomUUID();
  const results = await Promise.all(Array.from({ length: 12 }, (_, index) => request('/api/notes', 'POST', { title: 'Lesson', content }, login, key, index % 2 ? childBase : base)));
  assert.equal(results.filter(row => row.status === 201).length, 1);
  assert.equal(results.filter(row => row.status === 200).length, 11);
  assert.equal(new Set(results.map(row => row.body.id)).size, 1);
  for (const Model of [Note, XpEvent, XpFingerprint, Unlock, Inventory, Progress]) assert.equal(await Model.countDocuments(), 1, Model.modelName);
  assert.equal((await Progress.findOne()).totalXp, 20);
  assert.equal((await Progress.findOne()).revision, 1);
  assert.equal((await Inventory.findOne()).quantity, 1);
});
test('idempotency payload conflict is 409; deleted requests never recreate notes or XP', async () => {
  const login = await account(), key = randomUUID();
  const saved = await request('/api/notes', 'POST', { title: 'Lesson', content }, login, key);
  assert.equal((await request('/api/notes', 'POST', { title: 'Changed', content }, login, key)).body.code, 'IDEMPOTENCY_CONFLICT');
  assert.equal((await request(`/api/notes/${saved.body.id}`, 'DELETE', { revision: 0 }, login)).status, 200);
  const deleted = await request('/api/notes', 'POST', { title: 'Lesson', content }, login, key);
  assert.equal(deleted.status, 410); assert.equal(deleted.body.code, 'NOTE_DELETED');
  assert.equal(await Note.countDocuments(), 0); assert.equal(await XpEvent.countDocuments(), 1);
});
test('different request keys for duplicate content award XP once, scoped per user', async () => {
  const login = await account();
  const responses = await Promise.all(Array.from({ length: 8 }, (_, index) => request('/api/notes', 'POST', { title: `Copy ${index}`, content: index % 2 ? content.toUpperCase() : content }, login, randomUUID(), index % 2 ? childBase : base)));
  assert.ok(responses.every(row => row.status === 201), JSON.stringify(responses));
  assert.equal(await XpEvent.countDocuments({ amount: 20 }), 1);
  assert.equal(await XpEvent.countDocuments({ reason: 'duplicate_content' }), 7);
  assert.equal((await Progress.findOne()).totalXp, 20);
  const other = await account('other@example.com');
  await request('/api/notes', 'POST', { title: 'Other account', content }, other);
  assert.equal((await request('/api/progress', 'GET', undefined, other)).body.totalXp, 20);
});
test('daily cap holds across processes and cannot be bypassed by retrying on the next UTC day', async () => {
  const login = await account();
  const keys = Array.from({ length: 14 }, () => randomUUID());
  const responses = await Promise.all(keys.map((key, index) => request('/api/notes', 'POST', { title: `Lesson ${index}`, content: content + index }, login, key, index % 2 ? childBase : base)));
  assert.ok(responses.every(row => row.status === 201), JSON.stringify(responses));
  assert.equal((await Progress.findOne()).totalXp, 200);
  assert.equal(await XpEvent.countDocuments({ reason: 'daily_cap' }), 4);
  const capped = await XpEvent.findOne({ reason: 'daily_cap' });
  const index = keys.indexOf(capped.eventKey.replace('note:create:', ''));
  clock += 24 * 60 * 60 * 1000;
  assert.equal((await request('/api/notes', 'POST', { title: `Lesson ${index}`, content: content + index }, login, keys[index])).status, 200);
  await request('/api/notes', 'POST', { title: 'Copy next day', content: content + index }, login);
  assert.equal((await Progress.findOne()).totalXp, 200);
  await request('/api/notes', 'POST', { title: 'Fresh next day', content: content + 'fresh' }, login);
  assert.equal((await Progress.findOne()).totalXp, 220);
});
test('XP-03 crossing a level with missing intermediate rewards grants every reached milestone once', async () => {
  const login = await account();
  await Progress.create({ userId: login.user.id, totalXp: 530 });
  const key = randomUUID();
  await request('/api/notes', 'POST', { title: 'Milestone', content }, login, key);
  const progress = await request('/api/progress', 'GET', undefined, login);
  assert.equal(progress.body.totalXp, 550); assert.equal(progress.body.level, 5);
  const rewards = (await request('/api/rewards', 'GET', undefined, login)).body;
  assert.equal(rewards.unlocks.length, 4); assert.ok(rewards.inventory.every(row => row.quantity === 1));
  await request('/api/notes', 'POST', { title: 'Milestone', content }, login, key);
  assert.equal(await Unlock.countDocuments(), 4); assert.equal(await Inventory.countDocuments(), 4);
});
test('XP-04 failure after ledger or after inventory rolls back every collection', async () => {
  const login = await account(); const key = randomUUID();
  for (const stage of ['ledger', 'inventory']) {
    failAt = stage;
    const response = await request('/api/notes', 'POST', { title: 'Rollback', content }, login, key);
    assert.equal(response.status, 500); assert.equal(response.body.code, 'INTERNAL_ERROR');
    for (const Model of [Note, XpEvent, XpFingerprint, Progress, Unlock, Inventory]) assert.equal(await Model.countDocuments(), 0, `${stage}: ${Model.modelName}`);
  }
  failAt = null;
  assert.equal((await request('/api/notes', 'POST', { title: 'Rollback', content }, login, key)).status, 201);
  assert.equal((await Progress.findOne()).totalXp, 20);
});
test('XP-05 edit/delete do not grant or revoke XP; draft and legacy notes earn nothing', async () => {
  const login = await account();
  const saved = await request('/api/notes', 'POST', { title: 'Lesson', content }, login);
  await request(`/api/notes/${saved.body.id}`, 'PATCH', { revision: 0, content: content + 'edit' }, login);
  await request(`/api/notes/${saved.body.id}`, 'DELETE', { revision: 1 }, login);
  await request('/api/notes', 'POST', { title: 'Copy deleted', content }, login);
  await request('/api/notes', 'POST', { title: 'Draft', content: '' }, login);
  await Note.create({ title: 'Legacy', content });
  assert.equal((await Progress.findOne()).totalXp, 20);
  assert.equal(await XpEvent.countDocuments(), 3);
  assert.equal(await XpEvent.countDocuments({ reason: 'draft' }), 1);
  assert.equal((await Inventory.findOne()).quantity, 1);
});
test('progress/rewards require auth and never use client-supplied user IDs', async () => {
  assert.equal((await request('/api/progress')).status, 401);
  assert.equal((await request('/api/rewards')).status, 401);
  const a = await account('a@example.com'), b = await account('b@example.com');
  await request('/api/notes', 'POST', { title: 'Lesson', content }, a);
  assert.equal((await request(`/api/progress?userId=${a.user.id}`, 'GET', undefined, b)).body.totalXp, 0);
  assert.deepEqual((await request('/api/rewards', 'GET', undefined, b)).body.inventory, []);
});
test('Godot export preserves earned XP and rewards after all notes have been deleted', async () => {
  const login = await account();
  const saved = await request('/api/notes', 'POST', { title: 'Lesson', content }, login);
  await request(`/api/notes/${saved.body.id}`, 'DELETE', { revision: 0 }, login);
  const response = await request('/api/godot/export', 'GET', undefined, login);
  assert.equal(response.status, 200); assert.equal(response.body.totalXp, 20);
  assert.equal(response.body.notesCount, 0); assert.deepEqual(response.body.notes, []);
  assert.equal(response.body.progress.totalXp, 20);
  assert.equal(response.body.rewards.inventory.length, 1);
});
