// Cross-module acceptance through public HTTP only. Owns an isolated replica set;
// never reads .env, seeds entitlements or mutates the application database.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { fork } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const mongoose = require('mongoose');
require('../../app'); // Register every model before the DB helper creates indexes.
const { startTestDatabase } = require('../helpers/mongo');
let database, child, origin;
async function startApi() {
  child = fork(path.join(__dirname, '../helpers/api-process.js'), [], {
    env: { ...process.env, NODE_ENV: 'test', KC_TEST_MONGO_URI: database.uri },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc']
  });
  const [message] = await once(child, 'message'); assert.ok(message.port, 'API process must start');
  origin = `http://127.0.0.1:${message.port}`;
}
async function stopApi() {
  if (child?.exitCode === null) { const ended = once(child, 'exit'); child.send('stop'); await ended; }
}
before(async () => { database = await startTestDatabase(); await startApi(); }, { timeout: 240000 });
after(async () => { await stopApi(); await database?.stop(); });
async function request(route, { method = 'GET', body, auth, key } = {}) {
  const response = await fetch(origin + route, { method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Cookie: auth.cookie, 'X-CSRF-Token': auth.csrfToken } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const data = response.status === 204 ? null : await response.json();
  return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function ok(route, options, status = 200) {
  const response = await request(route, options); assert.equal(response.status, status, `${route}: ${JSON.stringify(response.data)}`); return response.data;
}
const credentials = { email: 'acceptance@example.test', password: 'disposable acceptance password 2026', displayName: 'Acceptance Student' };
async function login() {
  const response = await request('/api/auth/login', { method: 'POST', body: credentials });
  assert.equal(response.status, 200); return { ...response.data, cookie: response.cookie };
}
const findEntry = (journey, id) => [...journey.achievements, ...journey.quests].find(entry => entry.id === id);

test('local API core loop persists account drafts, note rewards, city, review and claims through two restarts and re-login', { timeout: 60000 }, async () => {
  await ok('/api/auth/register', { method: 'POST', body: credentials }, 201);
  let auth = await login();
  const content = 'Trong tam giác vuông, bình phương cạnh huyền bằng tổng bình phương hai cạnh góc vuông. Giải thích bằng ví dụ cụ thể và tự nhớ lại công thức trước khi xem đáp án.';
  const payload = { title: 'Pitago acceptance lesson', category: 'Toán', content, tags: ['acceptance'], template: '1',
    canvasJSON: JSON.stringify({ objects: [{ type: 'textbox', text: 'a² + b² = c²' }] }) };
  const createKey = randomUUID(), draftId = randomUUID();
  const draftData = { noteId: null, baseRevision: null,
    fields: { ...payload, tags: 'acceptance' },
    pending: { method: 'POST', noteId: null, revision: null, key: createKey, payload } };
  const savedDraft = (await ok(`/api/drafts/${draftId}`, { method: 'PUT', auth, body: { revision: 0, data: draftData } })).draft;
  assert.equal((await ok('/api/progress', { auth })).totalXp, 0);
  assert.deepEqual(await ok('/api/notes', { auth }), []);
  await stopApi(); await startApi();
  assert.equal((await ok('/api/auth/me', { auth })).user.id, auth.user.id);
  const recovered = (await ok(`/api/drafts/${draftId}`, { auth })).draft;
  assert.deepEqual(recovered.data, draftData);
  const note = await ok('/api/notes', { method: 'POST', auth, key: recovered.data.pending.key, body: recovered.data.pending.payload }, 201);
  assert.equal((await ok('/api/notes', { method: 'POST', auth, key: createKey, body: payload })).id, note.id);
  await ok(`/api/drafts/${draftId}`, { method: 'DELETE', auth, body: { revision: savedDraft.revision } }, 204);
  assert.equal((await ok('/api/drafts', { auth })).drafts.length, 0);
  assert.equal((await ok('/api/progress', { auth })).totalXp, 20);
  let rewards = await ok('/api/rewards', { auth });
  assert.equal(rewards.unlocks.length, 1); assert.equal(rewards.inventory[0].quantity, 1);

  const placement = { catalogId: rewards.inventory[0].catalogId, x: 3, y: 5, revision: 0 }, placeKey = randomUUID();
  const placed = await ok('/api/city/buildings', { method: 'POST', auth, body: placement, key: placeKey }, 201);
  assert.equal(placed.inventory[0].quantity, 0);
  const moved = await ok(`/api/city/buildings/${placed.buildingId}`, { method: 'PATCH', auth, body: { x: 4, y: 6, revision: 1 }, key: randomUUID() });
  assert.equal(moved.city.revision, 2);
  for (let i = 0; i < 3; i++) {
    const session = (await ok('/api/reviews', { method: 'POST', auth, key: randomUUID(), body: { noteIds: [note.id] } }, 201)).session;
    const rated = await ok(`/api/reviews/${session.id}/answers`, { method: 'POST', auth, key: randomUUID(), body: { cardIndex: 0, revision: 0, rating: i === 0 ? 'again' : 'remembered' } });
    assert.equal(rated.session.status, 'completed');
  }
  const journey = await ok('/api/journey', { auth });
  for (const id of ['first_note', 'first_review', 'first_city', 'daily_note', 'daily_review']) assert.equal(findEntry(journey, id).eligible, true, id);
  for (const id of ['first_note', 'first_review', 'first_city']) await ok(`/api/journey/achievements/${id}`, { method: 'PUT', auth, body: {} });
  for (const id of ['daily_note', 'daily_review']) await ok(`/api/journey/quests/${id}`, { method: 'PUT', auth, body: { day: journey.day } });
  const claimed = await ok('/api/journey', { auth });
  const summary = await ok('/api/reviews', { auth });
  assert.equal(summary.recent.length, 3);
  await stopApi(); await startApi();
  assert.deepEqual((await ok('/api/city', { auth })).city, moved.city);
  assert.deepEqual(await ok('/api/journey', { auth }), claimed);
  assert.deepEqual(await ok('/api/reviews', { auth }), summary);
  await ok('/api/auth/logout', { method: 'POST', auth }, 204);
  assert.equal((await request('/api/notes', { auth })).status, 401);
  auth = await login();
  assert.deepEqual((await ok('/api/city', { auth })).city, moved.city);
  assert.equal((await ok('/api/notes', { auth })).length, 1);
  assert.deepEqual((await ok('/api/notes', { auth }))[0].canvasJSON, payload.canvasJSON);
  const replayed = await ok('/api/city/buildings', { method: 'POST', auth, body: placement, key: placeKey });
  assert.equal(replayed.replayed, true); assert.deepEqual(replayed.city, moved.city);
  assert.equal(replayed.inventory[0].quantity, 0);
  const removed = await ok(`/api/city/buildings/${placed.buildingId}`, { method: 'DELETE', auth, body: { revision: 2 }, key: randomUUID() });
  assert.equal(removed.inventory[0].quantity, 1); assert.equal(removed.city.buildings.length, 0);
  assert.equal(findEntry(await ok('/api/journey', { auth }), 'first_city').claimedAt, findEntry(claimed, 'first_city').claimedAt);
  const exported = await ok('/api/godot/export', { auth });
  assert.equal(exported.progress.totalXp, 20); assert.equal(exported.notes.length, 1);
  rewards = await ok('/api/rewards', { auth }); assert.equal(rewards.inventory[0].quantity, 1); assert.equal(rewards.unlocks.length, 1);
  assert.equal(await mongoose.model('XpEvent').countDocuments(), 1);
  assert.equal(await mongoose.model('JourneyClaim').countDocuments(), 5);
});
