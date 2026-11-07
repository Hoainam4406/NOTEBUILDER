const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { fork } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const mongoose = require('mongoose');
const { createApp } = require('../../app');
const { createJourneyService } = require('../../journey');
const { startTestDatabase } = require('../helpers/mongo');
const JourneyClaim = require('../../models/JourneyClaim');
const XpEvent = require('../../models/XpEvent');
const City = require('../../models/City');
const Note = require('../../models/Note');
let database, server, base, child, childBase;
const password = 'disposable journey password';
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
async function request(url, method = 'GET', body, login, origin = base, csrf = login?.csrfToken) {
  const response = await fetch(origin + url, { method, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID(),
    ...(login ? { Cookie: login.cookie, 'X-CSRF-Token': csrf || '' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
async function account(email = 'journey@example.test') {
  assert.equal((await request('/api/auth/register', 'POST', { email, password, displayName: 'Journey Student' })).status, 201);
  const response = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  return { cookie: response.headers.get('set-cookie').split(';')[0], ...await response.json() };
}
async function note(a, content = 'Một bài học về cách giải thích lại điều đã học bằng lời của chính mình, ghi nhớ ví dụ cụ thể và kiểm tra các bước trước khi kết luận.') {
  const result = await request('/api/notes', 'POST', { title: 'Lesson', content }, a); assert.equal(result.status, 201); return result.body;
}
const dashboard = async a => (await request('/api/journey', 'GET', undefined, a)).body;
const badge = (a, id = 'first_note', origin = base) => request(`/api/journey/achievements/${id}`, 'PUT', {}, a, origin);
const quest = (a, id, day, origin = base) => request(`/api/journey/quests/${id}`, 'PUT', { day }, a, origin);
const entry = (data, id) => [...data.achievements, ...data.quests].find(row => row.id === id);

test('JRN-01 auth/CSRF/owner and strict claim validation block injected counters or cross-account credit', async () => {
  assert.equal((await request('/api/journey')).status, 401);
  const a = await account(), b = await account('other@example.test'); await note(a);
  assert.equal((await request('/api/journey/achievements/first_note', 'PUT', {}, a, base, 'wrong')).status, 403);
  for (const body of [null, [], { userId: a.user.id }, { progress: 1 }, { xp: 20 }]) assert.equal((await request('/api/journey/achievements/first_note', 'PUT', body, a)).status, 400);
  for (const body of [{}, { day: '2026-02-30' }, { day: '2026-11-07', progress: 1 }, { day: { $ne: null } }]) assert.equal((await request('/api/journey/quests/daily_note', 'PUT', body, a)).status, 400);
  assert.equal((await badge(a, 'unknown')).status, 404);
  assert.equal((await badge(b)).body.code, 'JOURNEY_NOT_READY');
  assert.equal(entry(await dashboard(b), 'first_note').progress, 0); assert.equal(await JourneyClaim.countDocuments(), 0);
});

test('JRN-02 only XP-awarded events count, drafts/duplicates do not; deleting a note preserves progress and claims', async () => {
  const a = await account(), original = await note(a); await note(a); await note(a, 'Short');
  await Note.create({ title: 'Unowned legacy', content: 'Not a ledger event' });
  const data = await dashboard(a);
  assert.equal(entry(data, 'first_note').progress, 1); assert.equal(entry(data, 'five_notes').progress, 1);
  assert.equal(entry(data, 'daily_note').eligible, true); assert.equal(entry(data, 'three_days').progress, 1);
  assert.equal((await badge(a)).status, 200);
  await request(`/api/notes/${original.id}`, 'DELETE', { revision: 0 }, a);
  const restored = await dashboard(a); assert.equal(entry(restored, 'five_notes').progress, 1); assert.ok(entry(restored, 'first_note').claimedAt);
  assert.doesNotMatch(JSON.stringify(restored), /userId|payloadHash|cách giải thích lại điều đã học/);
});

test('JRN-03 parallel claim PUTs across processes create one persistent record/timestamp without rewards or XP mutations', async () => {
  const a = await account(); await note(a);
  const before = { xp: (await request('/api/progress', 'GET', undefined, a)).body, rewards: (await request('/api/rewards', 'GET', undefined, a)).body };
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => badge(a, 'first_note', i % 2 ? childBase : base)));
  assert.ok(results.every(row => row.status === 200), JSON.stringify(results));
  assert.equal(results.filter(row => !row.body.replayed).length, 1); assert.equal(new Set(results.map(row => row.body.claim.claimedAt)).size, 1);
  assert.equal(await JourneyClaim.countDocuments(), 1);
  assert.deepEqual((await request('/api/progress', 'GET', undefined, a)).body, before.xp);
  assert.deepEqual((await request('/api/rewards', 'GET', undefined, a)).body, before.rewards);
  await stopChild(); await startChild();
  assert.equal((await badge(a, 'first_note', childBase)).body.claim.claimedAt, results[0].body.claim.claimedAt);
});

test('JRN-02 review quest counts confirmed rating timestamps across active/closed/completed sessions', async () => {
  const a = await account(), n = await note(a); let data = await dashboard(a);
  assert.equal((await quest(a, 'daily_review', data.day)).body.code, 'JOURNEY_NOT_READY');
  let s = (await request('/api/reviews', 'POST', { noteIds: [n.id] }, a)).body.session;
  await request(`/api/reviews/${s.id}/answers`, 'POST', { cardIndex: 0, rating: 'again', revision: 0 }, a);
  assert.equal(entry(await dashboard(a), 'first_review').eligible, true);
  const other = await note(a, 'Short summary');
  s = (await request('/api/reviews', 'POST', { noteIds: [n.id, other.id] }, a)).body.session;
  await request(`/api/reviews/${s.id}/answers`, 'POST', { cardIndex: 0, rating: 'remembered', revision: 0 }, a);
  assert.equal(entry(await dashboard(a), 'daily_review').progress, 2);
  await request(`/api/reviews/${s.id}/close`, 'POST', { revision: 1 }, a);
  s = (await request('/api/reviews', 'POST', { noteIds: [n.id, other.id] }, a)).body.session;
  await request(`/api/reviews/${s.id}/answers`, 'POST', { cardIndex: 0, rating: 'again', revision: 0 }, a);
  data = await dashboard(a); assert.equal(entry(data, 'daily_review').eligible, true);
  const results = await Promise.all([quest(a, 'daily_review', data.day), quest(a, 'daily_review', data.day, childBase)]);
  assert.ok(results.every(row => row.status === 200)); assert.equal(results.filter(row => !row.body.replayed).length, 1);
  assert.equal(await JourneyClaim.countDocuments({ kind: 'quest' }), 1);
});

test('JRN-04 UTC boundaries reset quests without removing lifetime badges or old day records', async () => {
  const a = await account(); await note(a);
  const owner = new mongoose.Types.ObjectId(a.user.id), dates = ['2026-11-04', '2026-11-05', '2026-11-06'];
  // Controlled evidence in the suite-owned DB, never a public grant endpoint.
  await XpEvent.deleteMany({});
  await XpEvent.insertMany(dates.map(day => ({ userId: owner, eventKey: randomUUID(), payloadHash: 'x', noteId: new mongoose.Types.ObjectId(), policyVersion: 1, amount: 20, reason: 'awarded', day, createdAt: new Date(`${day}T12:00:00Z`) })));
  let date = new Date('2026-11-06T23:59:59.999Z'); const service = createJourneyService({ now: () => date });
  let data = await service.dashboard(a.user.id); assert.equal(data.day, '2026-11-06'); assert.equal(data.resetsAt.toISOString(), '2026-11-07T00:00:00.000Z');
  assert.equal(entry(data, 'three_days').eligible, true);
  await service.claim(a.user.id, 'achievement', 'three_days', {});
  await service.claim(a.user.id, 'quest', 'daily_note', { day: data.day });
  date = new Date('2026-11-07T00:00:00Z'); data = await service.dashboard(a.user.id);
  assert.equal(entry(data, 'daily_note').progress, 0); assert.equal(entry(data, 'daily_note').claimedAt, null);
  assert.ok(entry(data, 'three_days').claimedAt); assert.equal(await JourneyClaim.countDocuments(), 2);
  await assert.rejects(service.claim(a.user.id, 'quest', 'daily_note', { day: '2026-11-06' }), { code: 'QUEST_DAY_CHANGED' });
  assert.equal(await JourneyClaim.countDocuments(), 2);
});

test('JRN-04 a failed claim transaction rolls back and can be retried without partial records', async () => {
  const a = await account(); await note(a);
  const faulty = createJourneyService({ afterWrite: async () => { throw new Error('Injected transaction failure'); } });
  await assert.rejects(faulty.claim(a.user.id, 'achievement', 'first_note', {}), /Injected/);
  assert.equal(await JourneyClaim.countDocuments(), 0);
  assert.equal((await badge(a)).body.replayed, false); assert.equal((await badge(a)).body.replayed, true);
});

test('city achievement needs persisted revision, remains after buildings are removed, and is owner-only', async () => {
  const a = await account(), b = await account('city-other@example.test');
  assert.equal(entry(await dashboard(a), 'first_city').eligible, false);
  await City.create({ userId: a.user.id, revision: 0, buildings: [] });
  assert.equal(entry(await dashboard(a), 'first_city').eligible, false);
  await City.updateOne({ userId: a.user.id }, { $set: { revision: 3 } });
  assert.equal((await badge(a, 'first_city')).status, 200);
  assert.equal(entry(await dashboard(b), 'first_city').eligible, false);
  assert.ok(entry(await dashboard(a), 'first_city').claimedAt);
});
