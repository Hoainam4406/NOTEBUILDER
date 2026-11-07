const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { fork } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const mongoose = require('mongoose');
const { createApp } = require('../../app');
const { startTestDatabase } = require('../helpers/mongo');
const ReviewSession = require('../../models/ReviewSession');
const Note = require('../../models/Note');
let database, server, base, child, childBase;
const password = 'disposable review test password';
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
async function request(url, method = 'GET', body, login, key = randomUUID(), origin = base, csrf = login?.csrfToken) {
  const response = await fetch(origin + url, { method, headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}),
    ...(login ? { Cookie: login.cookie, 'X-CSRF-Token': csrf || '' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
async function account(email = 'review@example.test') {
  assert.equal((await request('/api/auth/register', 'POST', { email, password, displayName: 'Review Student' })).status, 201);
  const response = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  return { cookie: response.headers.get('set-cookie').split(';')[0], ...await response.json() };
}
async function note(login, title = 'Recall lesson', content = 'Một bài học có đủ nội dung để ghi nhớ, tự giải thích lại và ôn tập bằng flashcard. Không gửi XP từ client để tự cấp thưởng.') {
  const result = await request('/api/notes', 'POST', { title, content }, login); assert.equal(result.status, 201); return result.body;
}
async function start(login, ids, key = randomUUID(), origin = base) {
  return request('/api/reviews', 'POST', { noteIds: ids }, login, key, origin);
}
const answer = (index = 0, revision = 0, rating = 'remembered') => ({ cardIndex: index, revision, rating });

test('REV-01 review routes enforce session/CSRF and all reads/mutations hide foreign sessions', async () => {
  for (const url of ['/api/reviews', '/api/reviews/notes', '/api/reviews/0123456789abcdef01234567']) assert.equal((await request(url)).status, 401);
  const a = await account(), b = await account('other@example.test'); const source = await note(a);
  assert.equal((await request('/api/reviews', 'POST', { noteIds: [source.id] }, a, randomUUID(), base, 'wrong')).status, 403);
  const s = (await start(a, [source.id])).body.session;
  assert.equal((await request(`/api/reviews/${s.id}`, 'GET', undefined, b)).status, 404);
  for (const [suffix, body] of [['answers', answer()], ['close', { revision: 0 }]]) {
    assert.equal((await request(`/api/reviews/${s.id}/${suffix}`, 'POST', body, b)).status, 404);
    assert.equal((await request(`/api/reviews/${s.id}/${suffix}`, 'POST', body, a, randomUUID(), base, 'wrong')).status, 403);
  }
  assert.deepEqual((await request('/api/reviews', 'GET', undefined, b)).body, { active: null, recent: [] });
});

test('REV-02 start rejects foreign, legacy, empty and injected selections without creating sessions', async () => {
  const a = await account(), b = await account('other@example.test'); const foreign = await note(b), empty = await note(a, 'Canvas only', '');
  const legacy = await Note.create({ title: 'Legacy', content: 'Unowned private data' });
  for (const ids of [[foreign.id], [String(legacy._id)], ['0123456789abcdef01234567']]) assert.equal((await start(a, ids)).body.code, 'REVIEW_NOTE_NOT_FOUND');
  assert.equal((await start(a, [empty.id])).body.code, 'REVIEW_NOTE_EMPTY');
  for (const body of [{ noteIds: [] }, { noteIds: [empty.id, empty.id] }, { noteIds: [empty.id], xp: 10 }]) assert.equal((await request('/api/reviews', 'POST', body, a)).status, 400);
  assert.equal((await request('/api/reviews', 'POST', { noteIds: [empty.id] }, a, null)).status, 400);
  assert.equal(await ReviewSession.countDocuments(), 0);
});

test('review choices are owner-filtered, bounded and omit canvas payloads and empty notes', async () => {
  const a = await account();
  await Note.insertMany(Array.from({ length: 105 }, (_, i) => ({ ownerId: a.user.id, title: `Lesson ${i}`, content: 'Answer', canvasImage: 'private image' })));
  await Note.create({ ownerId: a.user.id, title: 'Whitespace', content: '  \n  ' });
  await Note.create({ title: 'Legacy', content: 'Answer' });
  const result = (await request('/api/reviews/notes', 'GET', undefined, a)).body;
  assert.equal(result.notes.length, 100); assert.equal(result.limit, 100);
  assert.deepEqual(Object.keys(result.notes[0]).sort(), ['category', 'id', 'revision', 'title']);
  assert.ok(result.notes.every(row => row.title.startsWith('Lesson')));
});

test('REV-04 snapshots preserve selection order and survive editing/deleting source notes', async () => {
  const a = await account(), first = await note(a, 'First'), second = await note(a, 'Second');
  const s = (await start(a, [second.id, first.id])).body.session;
  assert.deepEqual(s.cards.map(card => card.question), ['Second', 'First']);
  await request(`/api/notes/${first.id}`, 'PATCH', { title: 'Changed', content: 'Changed content', revision: 0 }, a);
  await request(`/api/notes/${second.id}`, 'DELETE', { revision: 0 }, a);
  const restored = (await request(`/api/reviews/${s.id}`, 'GET', undefined, a)).body.session;
  assert.deepEqual(restored.cards, s.cards); assert.equal(restored.cards[1].noteRevision, 0);
  assert.doesNotMatch(JSON.stringify(restored), /createKey|createHash|receipts|userId/);
});

test('REV-03 same-key starts across processes create one session; other start keys cannot replace active work', async () => {
  const a = await account(), source = await note(a), key = randomUUID();
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => start(a, [source.id], key, i % 2 ? base : childBase)));
  assert.equal(results.filter(result => result.status === 201).length, 1);
  assert.ok(results.every(result => [200, 201].includes(result.status)), JSON.stringify(results));
  assert.equal(new Set(results.map(result => result.body.session.id)).size, 1); assert.equal(await ReviewSession.countDocuments(), 1);
  assert.equal((await start(a, [source.id])).body.code, 'REVIEW_ACTIVE');
  const second = await note(a, 'Another'); assert.equal((await start(a, [second.id], key)).body.code, 'IDEMPOTENCY_CONFLICT');
});

test('different concurrent start keys leave one active session via the unique partial index', async () => {
  const a = await account(), source = await note(a);
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => start(a, [source.id], randomUUID(), i % 2 ? base : childBase)));
  assert.equal(results.filter(result => result.status === 201).length, 1);
  assert.ok(results.filter(result => result.status !== 201).every(result => result.body.code === 'REVIEW_ACTIVE'), JSON.stringify(results));
  assert.equal(await ReviewSession.countDocuments({ status: 'active' }), 1);
});

test('REV-03 answer retries across processes record one rating and preserve XP/rewards', async () => {
  const a = await account(), one = await note(a), two = await note(a, 'Second', 'A short answer');
  const before = { progress: (await request('/api/progress', 'GET', undefined, a)).body, rewards: (await request('/api/rewards', 'GET', undefined, a)).body };
  const s = (await start(a, [one.id, two.id])).body.session, key = randomUUID();
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => request(`/api/reviews/${s.id}/answers`, 'POST', answer(), a, key, i % 2 ? base : childBase)));
  assert.ok(results.every(result => result.status === 200), JSON.stringify(results));
  assert.equal(results.filter(result => !result.body.replayed).length, 1);
  const row = await ReviewSession.findById(s.id).lean(); assert.equal(row.nextIndex, 1); assert.equal(row.revision, 1); assert.equal(row.receipts.length, 1);
  assert.deepEqual((await request('/api/progress', 'GET', undefined, a)).body, before.progress);
  assert.deepEqual((await request('/api/rewards', 'GET', undefined, a)).body, before.rewards);
});

test('two tabs with different answer keys and the same revision have exactly one winner', async () => {
  const a = await account(), source = await note(a), second = await note(a, 'Second', 'Short');
  const s = (await start(a, [source.id, second.id])).body.session;
  const results = await Promise.all([request(`/api/reviews/${s.id}/answers`, 'POST', answer(), a), request(`/api/reviews/${s.id}/answers`, 'POST', answer(0, 0, 'again'), a, randomUUID(), childBase)]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  assert.equal(results.find(result => result.status === 409).body.code, 'REVIEW_CONFLICT');
  assert.equal((await ReviewSession.findById(s.id)).nextIndex, 1);
});

test('idempotency rejects payload/operation changes and replay returns current completed state without text', async () => {
  const a = await account(), source = await note(a), createKey = randomUUID();
  const s = (await start(a, [source.id], createKey)).body.session, key = randomUUID();
  assert.equal((await request(`/api/reviews/${s.id}/answers`, 'POST', answer(), a, createKey)).body.code, 'IDEMPOTENCY_CONFLICT');
  const completed = await request(`/api/reviews/${s.id}/answers`, 'POST', answer(), a, key);
  assert.equal(completed.body.session.status, 'completed'); assert.equal(completed.body.session.cards[0].answer, ''); assert.equal(completed.body.session.cards[0].question, '');
  assert.equal((await request(`/api/reviews/${s.id}/answers`, 'POST', answer(0, 0, 'again'), a, key)).body.code, 'IDEMPOTENCY_CONFLICT');
  assert.equal((await request(`/api/reviews/${s.id}/close`, 'POST', { revision: 1 }, a, key)).body.code, 'IDEMPOTENCY_CONFLICT');
  assert.equal((await request(`/api/reviews/${s.id}/answers`, 'POST', answer(), a, key)).body.replayed, true);
  assert.equal((await start(a, [source.id], createKey)).body.session.status, 'completed');
  const history = (await request('/api/reviews', 'GET', undefined, a)).body;
  assert.equal(history.active, null); assert.equal(history.recent[0].remembered, 1); assert.equal(history.recent[0].reviewed, 1);
});

test('REV-04 early close preserves ratings, clears text and replays without an additional revision', async () => {
  const a = await account(), one = await note(a), two = await note(a, 'Second', 'Short');
  const s = (await start(a, [one.id, two.id])).body.session;
  await request(`/api/reviews/${s.id}/answers`, 'POST', answer(0, 0, 'again'), a);
  const key = randomUUID(), result = await request(`/api/reviews/${s.id}/close`, 'POST', { revision: 1 }, a, key);
  assert.equal(result.body.session.status, 'closed'); assert.equal(result.body.session.nextIndex, 1);
  assert.ok(result.body.session.cards.every(card => card.question === '' && card.answer === ''));
  assert.equal((await request(`/api/reviews/${s.id}/close`, 'POST', { revision: 1 }, a, key)).body.session.revision, 2);
  assert.equal((await start(a, [one.id])).status, 201);
});

test('resume persists through API process restart and corrupt snapshots fail without repair', async () => {
  const a = await account(), one = await note(a), two = await note(a, 'Second', 'Short');
  const s = (await start(a, [one.id, two.id])).body.session;
  await request(`/api/reviews/${s.id}/answers`, 'POST', answer(), a, randomUUID(), childBase);
  await stopChild(); await startChild();
  const restored = await request(`/api/reviews/${s.id}`, 'GET', undefined, a, randomUUID(), childBase);
  assert.equal(restored.body.session.nextIndex, 1); assert.equal(restored.body.session.cards[0].rating, 'remembered');
  await ReviewSession.updateOne({ _id: s.id }, { $set: { nextIndex: 30 } });
  const bad = await request(`/api/reviews/${s.id}`, 'GET', undefined, a);
  assert.equal(bad.status, 503); assert.equal(bad.body.code, 'REVIEW_DATA_INVALID');
  assert.equal((await ReviewSession.findById(s.id)).nextIndex, 30);
});

test('invalid source snapshot rolls back session creation and bounded twenty-card sessions close safely', async () => {
  const a = await account();
  const corrupt = await Note.create({ ownerId: a.user.id, title: 'Valid', content: 'Answer' });
  await Note.updateOne({ _id: corrupt._id }, { $set: { title: '' } });
  assert.equal((await start(a, [String(corrupt._id)])).body.code, 'REVIEW_DATA_INVALID');
  assert.equal(await ReviewSession.countDocuments(), 0);
  const rows = await Note.insertMany(Array.from({ length: 20 }, (_, i) => ({ ownerId: a.user.id, title: `Card ${i}`, content: 'Answer' })));
  const s = (await start(a, rows.map(row => String(row._id)))).body.session;
  assert.equal(s.cards.length, 20);
  assert.equal((await request(`/api/reviews/${s.id}/close`, 'POST', { revision: 0 }, a)).body.session.status, 'closed');
});
