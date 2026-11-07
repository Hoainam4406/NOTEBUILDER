const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { fork } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const mongoose = require('mongoose');
const { createApp } = require('../../app');
const { draftInput } = require('../../drafts');
const { startTestDatabase } = require('../helpers/mongo');
const NoteDraft = require('../../models/NoteDraft');
let database, server, base, child, childBase;
async function startChild() {
  child = fork(path.join(__dirname, '../helpers/api-process.js'), [], { env: { ...process.env, NODE_ENV: 'test', KC_TEST_MONGO_URI: database.uri }, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  const [message] = await once(child, 'message'); childBase = `http://127.0.0.1:${message.port}`;
}
async function stopChild() { if (child?.exitCode === null) { const stopped = once(child, 'exit'); child.send('stop'); await stopped; } }
before(async () => {
  database = await startTestDatabase(); server = createApp({ logger: { error() {} } }).listen(0, '127.0.0.1');
  await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`; await startChild();
}, { timeout: 240000 });
beforeEach(async () => { await Promise.all(Object.values(mongoose.models).map(model => model.deleteMany({}))); });
after(async () => { await stopChild(); if (server) await new Promise(resolve => server.close(resolve)); await database?.stop(); });
async function req(url, method = 'GET', body, login, origin = base, csrf = login?.csrfToken) {
  const response = await fetch(origin + url, { method, headers: { 'Content-Type': 'application/json', ...(login ? { Cookie: login.cookie, 'X-CSRF-Token': csrf || '' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}
async function account(email = 'draft@example.test') {
  const credentials = { email, password: 'disposable draft test password', displayName: 'Draft Student' };
  assert.equal((await req('/api/auth/register', 'POST', credentials)).status, 201);
  const response = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
  return { cookie: response.headers.get('set-cookie').split(';')[0], ...await response.json() };
}
const data = () => ({ noteId: null, baseRevision: null, fields: { title: '', category: ' Toán ', content: '  raw draft  ', tags: 'a, a', template: '2', canvasJSON: '{"objects":[]}' }, pending: null });
const save = (a, id, revision = 0, value = data(), origin = base) => req(`/api/drafts/${id}`, 'PUT', { revision, data: value }, a, origin);
test('DFT01 owner/session/CSRF isolation applies to list, get, save and delete', async () => {
  const a = await account(), b = await account('other@example.test'), id = randomUUID();
  assert.equal((await req('/api/drafts')).status, 401);
  assert.equal((await req(`/api/drafts/${id}`, 'PUT', { revision: 0, data: data() }, a, base, 'bad')).status, 403);
  await save(a, id);
  assert.equal((await req(`/api/drafts/${id}`, 'GET', undefined, b)).status, 404);
  assert.deepEqual((await req('/api/drafts', 'GET', undefined, b)).body.drafts, []);
  assert.equal((await req(`/api/drafts/${id}`, 'DELETE', { revision: 1 }, b)).status, 409);
  assert.equal((await save(b, id)).status, 200); assert.equal(await NoteDraft.countDocuments(), 2);
});
test('DFT01 strict input, raw draft fields, canvas JSON and bounded document size', async () => {
  const a = await account(), id = randomUUID();
  assert.equal((await save(a, 'invalid')).status, 400);
  for (const mutate of [d => { d.ownerId = 'injected'; }, d => { d.fields.canvasJSON = '[]'; }, d => { d.fields.title = 'x'.repeat(201); }, d => { d.pending = { xp: 50 }; }]) {
    const value = data(); mutate(value); assert.equal((await save(a, id, 0, value)).status, 400);
  }
  const value = data(); value.fields.canvasJSON = JSON.stringify({ image: 'x'.repeat(7000000) });
  value.pending = { method: 'POST', noteId: null, revision: null, key: randomUUID(), payload: { title: 'Valid', canvasJSON: value.fields.canvasJSON } };
  assert.throws(() => draftInput({ revision: 0, data: value }), { code: 'DRAFT_TOO_LARGE' });
  const stored = (await save(a, id)).body.draft;
  assert.equal(stored.data.fields.content, '  raw draft  '); assert.equal(stored.data.fields.title, '');
  const list = (await req('/api/drafts', 'GET', undefined, a)).body;
  assert.doesNotMatch(JSON.stringify(list), /raw draft|canvasJSON|userId|lastHash/);
});
test('DFT02 same-body races are replayed and changed-body revision races have exactly one winner', async () => {
  const a = await account(), id = randomUUID();
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => save(a, id, 0, data(), i % 2 ? childBase : base)));
  assert.ok(results.every(r => r.status === 200)); assert.equal(results.filter(r => !r.body.replayed).length, 1);
  const first = data(), second = data(); first.fields.title = 'A'; second.fields.title = 'B';
  const writers = await Promise.all([save(a, id, 1, first), save(a, id, 1, second, childBase)]);
  assert.deepEqual(writers.map(r => r.status).sort(), [200, 409]);
  assert.equal((await req(`/api/drafts/${id}`, 'GET', undefined, a)).body.draft.revision, 2);
  assert.equal((await save(a, id, 0)).status, 409);
});
test('DFT02 pending publish request and canvas survive process restart without creating Note or XP', async () => {
  const a = await account(), id = randomUUID(), value = data();
  value.pending = { method: 'POST', noteId: null, revision: null, key: randomUUID(), payload: { title: 'Published later', content: 'Long enough learning content '.repeat(8), canvasJSON: value.fields.canvasJSON } };
  await save(a, id, 0, value); await stopChild(); await startChild();
  const restored = (await req(`/api/drafts/${id}`, 'GET', undefined, a, childBase)).body.draft;
  assert.deepEqual(restored.data, value);
  assert.equal(await mongoose.model('Note').countDocuments(), 0); assert.equal(await mongoose.model('XpEvent').countDocuments(), 0);
  const publish = async () => {
    const response = await fetch(base + '/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: a.cookie, 'X-CSRF-Token': a.csrfToken, 'Idempotency-Key': restored.data.pending.key }, body: JSON.stringify(restored.data.pending.payload) });
    assert.ok(response.ok); return response.json();
  };
  const one = await publish(), two = await publish(); assert.equal(one.id, two.id);
  assert.equal(await mongoose.model('Note').countDocuments(), 1); assert.equal(await mongoose.model('XpEvent').countDocuments(), 1);
});
test('draft deletion uses observed revision and does not delete the source note', async () => {
  const a = await account(), id = randomUUID(); await save(a, id);
  assert.equal((await req(`/api/drafts/${id}`, 'DELETE', { revision: 0 }, a)).status, 409);
  assert.equal((await req(`/api/drafts/${id}`, 'DELETE', { revision: 1 }, a)).status, 204);
  assert.equal((await req(`/api/drafts/${id}`, 'GET', undefined, a)).status, 404);
});
