const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { fork } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const mongoose = require('mongoose');
const { createApp } = require('../../app');
const { createCityService } = require('../../city');
const { startTestDatabase } = require('../helpers/mongo');
const City = require('../../models/City');
const CityMutation = require('../../models/CityMutation');
const Inventory = require('../../models/Inventory');
let database, server, base, child, childBase, failAt;
const starter = 'bld_apartments_brickbrown_a';
const password = 'secure student password 123';
before(async () => {
  database = await startTestDatabase();
  server = createApp({ logger: { error() {} }, city: createCityService({ afterWrite(stage) {
    if (stage === failAt) throw new Error('Injected city failure');
  } }) }).listen(0, '127.0.0.1');
  await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`;
  child = fork(path.join(__dirname, '../helpers/api-process.js'), [], {
    env: { ...process.env, NODE_ENV: 'test', KC_TEST_MONGO_URI: database.uri }, stdio: ['ignore', 'inherit', 'inherit', 'ipc']
  });
  const [message] = await once(child, 'message'); assert.ok(message.port); childBase = `http://127.0.0.1:${message.port}`;
}, { timeout: 240000 });
beforeEach(async () => {
  failAt = null;
  await Promise.all(Object.values(mongoose.models).map(model => model.deleteMany({})));
});
after(async () => {
  if (child?.exitCode === null) { const stopped = once(child, 'exit'); child.send('stop'); await stopped; }
  if (server) await new Promise(resolve => server.close(resolve));
  await database?.stop();
});
async function request(url, method = 'GET', body, login, key = randomUUID(), origin = base, csrf = login?.csrfToken) {
  const response = await fetch(origin + url, { method,
    headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}),
      ...(login ? { Cookie: login.cookie, 'X-CSRF-Token': csrf || '' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}
async function account(email = 'student@example.com', grantStarter = true) {
  assert.equal((await request('/api/auth/register', 'POST', { email, password, displayName: 'Student' })).status, 201);
  const response = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  assert.equal(response.status, 200);
  const login = { cookie: response.headers.get('set-cookie').split(';')[0], ...await response.json() };
  if (grantStarter) assert.equal((await request('/api/notes', 'POST', { title: 'First lesson', content: 'Một ghi chú đầy đủ nội dung giải thích các định luật, ví dụ và ứng dụng vào bài học mỗi ngày.' }, login)).status, 201);
  return login;
}
const placeBody = (revision = 0, x = 0, y = 0) => ({ catalogId: starter, x, y, revision });
const cityState = async login => (await request('/api/city', 'GET', undefined, login)).body;
test('city/catalog endpoints require auth and CSRF; reads do not create city records', async () => {
  for (const [url, method] of [['/api/city', 'GET'], ['/api/city/catalog', 'GET'], ['/api/city/buildings', 'POST']]) assert.equal((await request(url, method)).status, 401);
  const login = await account();
  const catalog = await request('/api/city/catalog', 'GET', undefined, login);
  assert.equal(catalog.body.version, 1); assert.equal(catalog.body.items.length, 4);
  assert.equal(catalog.body.grid.coordinateSystem, 'axial');
  assert.equal((await cityState(login)).city.revision, 0);
  assert.equal(await City.countDocuments(), 0);
  assert.equal((await request('/api/city/buildings', 'POST', placeBody(), login, randomUUID(), base, 'wrong')).status, 403);
  assert.equal(await City.countDocuments(), 0);
});
test('CITY-01 placement commits coordinates, one inventory debit, revision and receipt together', async () => {
  const login = await account();
  const placed = await request('/api/city/buildings', 'POST', placeBody(0, 3, 5), login);
  assert.equal(placed.status, 201, JSON.stringify(placed.body));
  assert.equal(placed.body.city.revision, 1); assert.equal(placed.body.replayed, false);
  assert.deepEqual(placed.body.city.buildings, [{ id: placed.body.buildingId, catalogId: starter, x: 3, y: 5, rotation: 0 }]);
  assert.equal(placed.body.inventory[0].quantity, 0);
  assert.equal(await CityMutation.countDocuments(), 1);
  assert.equal((await request('/api/progress', 'GET', undefined, login)).body.totalXp, 20);
  assert.deepEqual((await cityState(login)).city, placed.body.city);
});
test('CITY-02 collision, bounds and blocked cells preserve layout, inventory and receipts', async () => {
  const login = await account();
  // Fixture represents an additional owned copy; no public endpoint grants it.
  await Inventory.updateOne({ userId: login.user.id, catalogId: starter }, { $set: { quantity: 2 } });
  await request('/api/city/buildings', 'POST', placeBody(), login);
  const before = await cityState(login);
  for (const [body, expected] of [[placeBody(1), 'CITY_COLLISION'], [placeBody(1, -1, 0), 'OUT_OF_BOUNDS'], [placeBody(1, 15, 15), 'BLOCKED_TILE']]) {
    const response = await request('/api/city/buildings', 'POST', body, login);
    assert.equal(response.body.code, expected);
    assert.deepEqual(await cityState(login), before);
    assert.equal(await CityMutation.countDocuments(), 1);
  }
});
test('CITY-03 ownership, inventory, catalog validation and account isolation cannot be bypassed', async () => {
  const a = await account('a@example.com'), b = await account('b@example.com', false);
  await Inventory.create({ userId: b.user.id, catalogId: starter, quantity: 1 });
  assert.equal((await request('/api/city/buildings', 'POST', placeBody(), b)).body.code, 'BUILDING_LOCKED');
  assert.equal((await request('/api/city/buildings', 'POST', { ...placeBody(), catalogId: 'unknown' }, a)).body.code, 'CATALOG_ITEM_NOT_FOUND');
  assert.equal((await request('/api/city/buildings', 'POST', { ...placeBody(), ownerId: b.user.id }, a)).status, 400);
  assert.equal((await request('/api/city/buildings', 'POST', placeBody(), a, null)).status, 400);
  await request('/api/city/buildings', 'POST', placeBody(), a);
  assert.equal((await request('/api/city/buildings', 'POST', placeBody(1, 2, 2), a)).body.code, 'INVENTORY_EMPTY');
  assert.deepEqual((await request(`/api/city?userId=${a.user.id}`, 'GET', undefined, b)).body.city.buildings, []);
  assert.equal((await cityState(a)).city.buildings.length, 1);
});
test('same-key retries across two API processes place and debit inventory exactly once', async () => {
  const login = await account(), key = randomUUID();
  const responses = await Promise.all(Array.from({ length: 12 }, (_, index) => request('/api/city/buildings', 'POST', placeBody(), login, key, index % 2 ? childBase : base)));
  assert.equal(responses.filter(row => row.status === 201).length, 1);
  assert.equal(responses.filter(row => row.status === 200).length, 11);
  assert.equal(new Set(responses.map(row => row.body.buildingId)).size, 1);
  assert.equal((await City.findOne()).revision, 1); assert.equal((await City.findOne()).buildings.length, 1);
  assert.equal((await Inventory.findOne()).quantity, 0); assert.equal(await CityMutation.countDocuments(), 1);
  const changed = await request('/api/city/buildings', 'POST', placeBody(0, 2, 2), login, key);
  assert.equal(changed.status, 409); assert.equal(changed.body.code, 'IDEMPOTENCY_CONFLICT');
});
test('CITY-04 different requests with the same revision have one winner across processes', async () => {
  const login = await account();
  await Inventory.updateOne({ userId: login.user.id, catalogId: starter }, { $set: { quantity: 2 } });
  const responses = await Promise.all([request('/api/city/buildings', 'POST', placeBody(0, 1, 1), login), request('/api/city/buildings', 'POST', placeBody(0, 1, 1), login, randomUUID(), childBase)]);
  assert.deepEqual(responses.map(row => row.status).sort(), [201, 409]);
  assert.equal(responses.find(row => row.status === 409).body.code, 'CITY_CONFLICT');
  assert.equal((await City.findOne()).buildings.length, 1); assert.equal((await Inventory.findOne()).quantity, 1);
  assert.equal(await CityMutation.countDocuments(), 1);
});
test('failure after inventory, city or receipt rolls back every mutation and retry remains safe', async () => {
  const login = await account(), key = randomUUID();
  for (const stage of ['inventory', 'city', 'receipt']) {
    failAt = stage;
    const response = await request('/api/city/buildings', 'POST', placeBody(), login, key);
    assert.equal(response.status, 500); assert.equal(response.body.code, 'INTERNAL_ERROR');
    assert.equal(await City.countDocuments(), 0); assert.equal(await CityMutation.countDocuments(), 0);
    assert.equal((await Inventory.findOne()).quantity, 1);
  }
  failAt = null;
  assert.equal((await request('/api/city/buildings', 'POST', placeBody(), login, key)).status, 201);
  assert.equal((await Inventory.findOne()).quantity, 0);
});
