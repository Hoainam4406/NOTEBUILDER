const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');
const mongoose = require('mongoose');
const { createApp } = require('../../app');
const User = require('../../models/User');
const Session = require('../../models/Session');
const AuthAttempt = require('../../models/AuthAttempt');
const Note = require('../../models/Note');
const { digest } = require('../../auth');
const { startTestDatabase } = require('../helpers/mongo');
let database, server, base, child, childBase;
async function startChild() {
  child = fork(path.join(__dirname, '../helpers/api-process.js'), [], {
    env: { ...process.env, NODE_ENV: 'test', KC_TEST_MONGO_URI: database.uri }, stdio: ['ignore', 'inherit', 'inherit', 'ipc']
  });
  const [message] = await once(child, 'message');
  assert.ok(message.port, message.error); childBase = `http://127.0.0.1:${message.port}`;
}
async function stopChild() {
  if (!child || child.exitCode !== null) return;
  const stopped = once(child, 'exit'); child.send('stop'); await stopped;
}
before(async () => {
  database = await startTestDatabase();
  server = createApp().listen(0, '127.0.0.1'); await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
  await startChild();
}, { timeout: 240000 });
beforeEach(async () => {
  // These models are bound only to the database created above.
  await Promise.all([User, Session, AuthAttempt, Note].map(model => model.deleteMany({})));
});
after(async () => {
  await stopChild();
  if (server) await new Promise(resolve => server.close(resolve));
  await database?.stop();
});
const password = 'secure student password 123';
async function request(url, method = 'GET', body, login, origin = base) {
  const response = await fetch(origin + url, { method,
    headers: { 'Content-Type': 'application/json', ...(login ? { Cookie: login.cookie, 'X-CSRF-Token': login.csrfToken } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, headers: response.headers, body: response.status === 204 ? null : await response.json() };
}
async function account(email = 'student@example.com') {
  assert.equal((await request('/api/auth/register', 'POST', { email, password, displayName: 'Student' })).status, 201);
  const response = await request('/api/auth/login', 'POST', { email, password });
  assert.equal(response.status, 200);
  return { cookie: response.headers.get('set-cookie').split(';')[0], ...response.body };
}
test('AUTH-01/02 unique email index prevents simultaneous registration in two processes', async () => {
  const payload = { email: 'Student@EXAMPLE.com', password, displayName: 'Student' };
  const responses = await Promise.all([request('/api/auth/register', 'POST', payload), request('/api/auth/register', 'POST', payload, null, childBase)]);
  assert.deepEqual(responses.map(row => row.status).sort(), [201, 409]);
  assert.equal(await User.countDocuments(), 1);
  const stored = await User.findOne().select('+passwordHash');
  assert.match(stored.passwordHash, /^scrypt:/); assert.equal(stored.email, 'student@example.com');
  const userIndexes = await User.collection.indexes();
  assert.ok(userIndexes.some(index => index.key.email === 1 && index.unique));
  for (const Model of [Session, AuthAttempt]) {
    const indexes = await Model.collection.indexes();
    assert.ok(indexes.some(index => index.key.expiresAt === 1 && index.expireAfterSeconds === 0));
  }
});
test('NOTE-03 session and notes persist through an API process restart', async () => {
  const login = await account();
  const saved = await request('/api/notes', 'POST', { title: 'Physics', content: 'F = ma' }, login);
  assert.equal(saved.status, 201);
  await stopChild(); await startChild();
  assert.equal((await request('/api/auth/me', 'GET', undefined, login, childBase)).body.user.id, login.user.id);
  const loaded = await request(`/api/notes/${saved.body.id}`, 'GET', undefined, login, childBase);
  assert.equal(loaded.body.content, 'F = ma'); assert.equal(loaded.body.revision, 0);
  assert.equal(loaded.body.ownerId, undefined);
  const stored = await Session.findOne();
  assert.equal(stored.tokenHash, digest(login.cookie.split('=')[1]));
});
test('AUTH-04 real DB isolates search, export, read, update and delete including legacy notes', async () => {
  const a = await account('a@example.com'), b = await account('b@example.com');
  const saved = await request('/api/notes', 'POST', { title: 'Private Physics', ownerId: b.user.id }, a);
  const legacy = await Note.create({ title: 'Legacy Physics' });
  for (const id of [saved.body.id, String(legacy._id)]) {
    for (const method of ['GET', 'PATCH', 'DELETE']) {
      assert.equal((await request(`/api/notes/${id}`, method, method === 'GET' ? undefined : { title: 'Attack', revision: 0 }, b)).status, 404);
    }
  }
  assert.deepEqual((await request('/api/notes?search=Physics', 'GET', undefined, b)).body, []);
  assert.equal((await request('/api/godot/export', 'GET', undefined, b)).body.notesCount, 0);
  assert.equal((await request('/api/notes', 'GET', undefined, a)).body.length, 1);
  assert.equal((await Note.findById(saved.body.id)).ownerId.toString(), a.user.id);
  assert.equal(await Note.countDocuments(), 2);
});
test('NOTE-05 DB compare-and-swap allows exactly one concurrent writer across processes', async () => {
  const login = await account();
  const saved = await request('/api/notes', 'POST', { title: 'Original' }, login);
  const url = `/api/notes/${saved.body.id}`;
  const responses = await Promise.all(Array.from({ length: 12 }, (_, index) => request(url, 'PATCH', { title: `Tab ${index}`, revision: 0 }, login, index % 2 ? childBase : base)));
  assert.equal(responses.filter(row => row.status === 200).length, 1);
  assert.equal(responses.filter(row => row.status === 409).length, 11);
  assert.equal((await Note.findById(saved.body.id)).revision, 1);
  assert.equal((await request(url, 'DELETE', { revision: 0 }, login)).status, 409);
  assert.equal((await request(url, 'DELETE', { revision: 1 }, login)).status, 200);
});
test('AUTH-03 DB counters enforce the shared login limit under concurrent processes', async () => {
  const responses = await Promise.all(Array.from({ length: 20 }, (_, index) => request('/api/auth/login', 'POST', { email: 'missing@example.com', password }, null, index % 2 ? childBase : base)));
  assert.equal(responses.filter(row => row.status === 401).length, 10);
  assert.equal(responses.filter(row => row.status === 429).length, 10);
  assert.equal(await AuthAttempt.countDocuments(), 2);
  const counters = await AuthAttempt.find();
  assert.ok(counters.every(row => row.count === 20));
});
test('session expiry is checked before TTL deletion and logout revokes both processes', async () => {
  const login = await account();
  const stored = await Session.findOne();
  await Session.updateOne({ _id: stored._id }, { $set: { expiresAt: new Date(Date.now() - 1) } });
  assert.equal((await request('/api/auth/me', 'GET', undefined, login, childBase)).status, 401);
  await Session.updateOne({ _id: stored._id }, { $set: { expiresAt: new Date(Date.now() + 60000) } });
  assert.equal((await request('/api/auth/logout', 'POST', undefined, login, childBase)).status, 204);
  assert.equal((await request('/api/auth/me', 'GET', undefined, login)).status, 401);
  assert.equal(await Session.countDocuments(), 0);
});
test('replica-set transactions roll back all writes on failure (prerequisite for X01)', async () => {
  await assert.rejects(mongoose.connection.transaction(async session => {
    await Note.create([{ title: 'Uncommitted' }], { session });
    throw new Error('Injected transaction failure');
  }), /Injected transaction failure/);
  assert.equal(await Note.countDocuments(), 0);
});
