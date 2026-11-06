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
async function startChild() {
  child = fork(path.join(__dirname, '../helpers/api-process.js'), [], {
    env: { ...process.env, NODE_ENV: 'test', KC_TEST_MONGO_URI: database.uri }, stdio: ['ignore', 'inherit', 'inherit', 'ipc']
  });
  const [message] = await once(child, 'message'); assert.ok(message.port); childBase = `http://127.0.0.1:${message.port}`;
}
async function stopChild() {
  if (child?.exitCode === null) { const stopped = once(child, 'exit'); child.send('stop'); await stopped; }
}
before(async () => {
  database = await startTestDatabase();
  server = createApp({ logger: { error() {} }, city: createCityService({ afterWrite(stage) {
    if (stage === failAt) throw new Error('Injected city failure');
  } }) }).listen(0, '127.0.0.1');
  await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`;
  await startChild();
}, { timeout: 240000 });
beforeEach(async () => {
  failAt = null;
  await Promise.all(Object.values(mongoose.models).map(model => model.deleteMany({})));
});
after(async () => {
  await stopChild();
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
test('move preserves identity/inventory and invalid moves retain the original city exactly', async () => {
  const login = await account();
  await Inventory.updateOne({ userId: login.user.id, catalogId: starter }, { $set: { quantity: 2 } });
  const first = await request('/api/city/buildings', 'POST', placeBody(), login);
  await request('/api/city/buildings', 'POST', placeBody(1, 2, 2), login);
  const url = `/api/city/buildings/${first.body.buildingId}`;
  const before = await cityState(login);
  for (const [x, y, code] of [[2, 2, 'CITY_COLLISION'], [15, 15, 'BLOCKED_TILE'], [32, 0, 'OUT_OF_BOUNDS']]) {
    assert.equal((await request(url, 'PATCH', { x, y, revision: 2 }, login)).body.code, code);
    assert.deepEqual(await cityState(login), before);
  }
  const moved = await request(url, 'PATCH', { x: 4, y: 5, revision: 2 }, login);
  assert.equal(moved.status, 200); assert.equal(moved.body.city.revision, 3);
  assert.deepEqual(moved.body.city.buildings.find(row => row.id === first.body.buildingId), { id: first.body.buildingId, catalogId: starter, x: 4, y: 5, rotation: 0 });
  assert.deepEqual(moved.body.inventory, before.inventory);
  assert.equal((await request(url, 'PATCH', { x: 0, y: 0, revision: 2 }, login)).body.code, 'CITY_CONFLICT');
});
test('CITY-05 remove retries refund once and replayed place/move never resurrect removed buildings', async () => {
  const login = await account(), placeKey = randomUUID(), moveKey = randomUUID(), removeKey = randomUUID();
  const placed = await request('/api/city/buildings', 'POST', placeBody(), login, placeKey);
  const url = `/api/city/buildings/${placed.body.buildingId}`;
  const moveBody = { x: 3, y: 4, revision: 1 };
  await request(url, 'PATCH', moveBody, login, moveKey);
  const results = await Promise.all(Array.from({ length: 8 }, (_, index) => request(url, 'DELETE', { revision: 2 }, login, removeKey, index % 2 ? childBase : base)));
  assert.ok(results.every(row => row.status === 200));
  assert.equal(results.filter(row => row.body.replayed === false).length, 1);
  assert.equal((await City.findOne()).revision, 3); assert.equal((await Inventory.findOne()).quantity, 1);
  assert.equal(await CityMutation.countDocuments(), 3);
  for (const response of [await request('/api/city/buildings', 'POST', placeBody(), login, placeKey), await request(url, 'PATCH', moveBody, login, moveKey)]) {
    assert.equal(response.status, 200); assert.equal(response.body.replayed, true);
    assert.equal(response.body.city.revision, 3); assert.deepEqual(response.body.city.buildings, []);
  }
  assert.equal((await request(url, 'DELETE', { revision: 3 }, login)).status, 404);
  assert.equal((await Inventory.findOne()).quantity, 1);
});
test('foreign IDs, invalid bodies, missing keys and CSRF are rejected for move/remove', async () => {
  const a = await account('a@example.com'), b = await account('b@example.com', false);
  const placed = await request('/api/city/buildings', 'POST', placeBody(), a);
  const url = `/api/city/buildings/${placed.body.buildingId}`;
  for (const method of ['PATCH', 'DELETE']) {
    const body = method === 'PATCH' ? { x: 2, y: 3, revision: 0 } : { revision: 0 };
    assert.equal((await request(url, method, body)).status, 401);
    assert.equal((await request(url, method, body, b)).status, 404);
    assert.equal((await request(url, method, body, a, randomUUID(), base, 'wrong')).status, 403);
    assert.equal((await request('/api/city/buildings/not-an-id', method, body, a)).status, 400);
    assert.equal((await request(url, method, body, a, null)).status, 400);
  }
  assert.equal((await request(url, 'PATCH', { x: 1, y: 1, revision: 1, catalogId: 'bld_cafe_a' }, a)).status, 400);
  assert.equal((await request(url, 'DELETE', { revision: 1, quantity: 99 }, a)).status, 400);
  assert.equal((await cityState(a)).city.revision, 1);
  assert.equal(await City.countDocuments(), 1);
});
test('move/remove transaction failures preserve city, inventory and receipt then allow safe retry', async () => {
  const login = await account();
  const placed = await request('/api/city/buildings', 'POST', placeBody(), login);
  const url = `/api/city/buildings/${placed.body.buildingId}`;
  const before = await cityState(login);
  for (const [method, body, stages] of [['PATCH', { x: 4, y: 4, revision: 1 }, ['city', 'receipt']], ['DELETE', { revision: 1 }, ['inventory', 'city', 'receipt']]]) {
    for (const stage of stages) {
      failAt = stage;
      assert.equal((await request(url, method, body, login)).status, 500);
      assert.deepEqual(await cityState(login), before);
      assert.equal(await CityMutation.countDocuments(), 1);
    }
  }
  failAt = null;
  assert.equal((await request(url, 'DELETE', { revision: 1 }, login)).status, 200);
  assert.equal((await Inventory.findOne()).quantity, 1);
});
test('CITY-04 move and remove with distinct keys and the same revision have one winner', async () => {
  const login = await account();
  const placed = await request('/api/city/buildings', 'POST', placeBody(), login);
  const url = `/api/city/buildings/${placed.body.buildingId}`;
  const responses = await Promise.all([
    request(url, 'PATCH', { x: 3, y: 3, revision: 1 }, login),
    request(url, 'DELETE', { revision: 1 }, login, randomUUID(), childBase)
  ]);
  assert.deepEqual(responses.map(row => row.status).sort(), [200, 409]);
  const state = await cityState(login);
  assert.equal(state.city.revision, 2);
  assert.equal(state.inventory[0].quantity + state.city.buildings.length, 1);
  assert.equal(await CityMutation.countDocuments(), 2);
});
test('CITY-05 city layout, inventory and receipts persist through an API process restart', async () => {
  const login = await account(), key = randomUUID();
  const placed = await request('/api/city/buildings', 'POST', placeBody(0, 7, 9), login, key, childBase);
  const before = await cityState(login);
  await stopChild(); await startChild();
  const loaded = await request('/api/city', 'GET', undefined, login, randomUUID(), childBase);
  assert.deepEqual(loaded.body, before);
  const replay = await request('/api/city/buildings', 'POST', placeBody(0, 7, 9), login, key, childBase);
  assert.equal(replay.status, 200); assert.equal(replay.body.buildingId, placed.body.buildingId);
  assert.equal(replay.body.inventory[0].quantity, 0);
});
test('corrupt stored layout returns controlled 503 without silently repairing or deleting data', async () => {
  const login = await account();
  const placed = await request('/api/city/buildings', 'POST', placeBody(), login);
  const original = await City.findOne().lean();
  for (const invalid of [{ layoutVersion: 99 }, { revision: -1 }, { buildings: [{ ...original.buildings[0], catalogId: 'unknown' }] }, { buildings: [...original.buildings, original.buildings[0]] }, { buildings: [{ ...original.buildings[0], x: 0.5 }] }]) {
    await City.collection.updateOne({ _id: original._id }, { $set: invalid });
    const response = await request('/api/city', 'GET', undefined, login);
    assert.equal(response.status, 503); assert.equal(response.body.code, 'CITY_DATA_INVALID');
    assert.equal((await request('/api/city/buildings', 'POST', placeBody(1, 2, 2), login)).body.code, 'CITY_DATA_INVALID');
    const stored = await City.collection.findOne({ _id: original._id });
    for (const field of Object.keys(invalid)) assert.deepEqual(stored[field], invalid[field]);
    await City.collection.updateOne({ _id: original._id }, { $set: { layoutVersion: 1, revision: 1, buildings: original.buildings } });
  }
  assert.equal((await cityState(login)).city.buildings[0].id, placed.body.buildingId);
  assert.equal(await CityMutation.countDocuments(), 1);
});
test('concurrent note reward and placement do not lose inventory or grant a reward twice', async () => {
  const login = await account();
  // Stage the next level boundary; the public API still supplies no XP amount.
  await mongoose.model('Progress').updateOne({ userId: login.user.id }, { $set: { totalXp: 90 } });
  const responses = await Promise.all([
    request('/api/city/buildings', 'POST', placeBody(), login),
    request('/api/notes', 'POST', { title: 'Next lesson', content: 'Một nội dung hoàn toàn khác giúp củng cố kiến thức đại số, với ví dụ phương trình và phép chứng minh cụ thể.' }, login, randomUUID(), childBase)
  ]);
  assert.ok(responses.every(row => row.status === 201), JSON.stringify(responses));
  const state = await cityState(login);
  assert.equal(state.city.buildings.length, 1);
  assert.equal(state.inventory.find(row => row.catalogId === starter).quantity, 0);
  assert.equal(state.inventory.find(row => row.catalogId === 'bld_house_small_brickred_a').quantity, 1);
  assert.equal((await request('/api/progress', 'GET', undefined, login)).body.totalXp, 110);
  assert.equal(await mongoose.model('Unlock').countDocuments(), 2);
});
test('idempotency keys cannot be reused for another operation or building target', async () => {
  const login = await account(), key = randomUUID();
  const placed = await request('/api/city/buildings', 'POST', placeBody(), login, key);
  const url = `/api/city/buildings/${placed.body.buildingId}`;
  for (const [target, method, body] of [[url, 'PATCH', { x: 2, y: 2, revision: 1 }], [url, 'DELETE', { revision: 1 }], [`/api/city/buildings/${new mongoose.Types.ObjectId()}`, 'DELETE', { revision: 1 }]]) {
    const response = await request(target, method, body, login, key);
    assert.equal(response.status, 409); assert.equal(response.body.code, 'IDEMPOTENCY_CONFLICT');
  }
  assert.equal((await City.findOne()).revision, 1); assert.equal((await Inventory.findOne()).quantity, 0);
});
test('bounded city capacity rejects another placement without spending inventory', async () => {
  const login = await account();
  // Full, valid fixture: 8 complete rows, before the reserved blocked region.
  const buildings = Array.from({ length: 256 }, (_, index) => ({ id: new mongoose.Types.ObjectId().toString(), catalogId: starter, x: index % 32, y: Math.floor(index / 32), rotation: 0 }));
  await City.create({ userId: login.user.id, revision: 0, buildings });
  const response = await request('/api/city/buildings', 'POST', placeBody(0, 0, 12), login);
  assert.equal(response.status, 409); assert.equal(response.body.code, 'CITY_FULL');
  assert.equal((await City.findOne()).buildings.length, 256); assert.equal((await City.findOne()).revision, 0);
  assert.equal((await Inventory.findOne()).quantity, 1); assert.equal(await CityMutation.countDocuments(), 0);
});
