const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../notegame-web/js/city-bridge.js'), 'utf8');
const catalog = require('../data/city-catalog.v1.json');
const buildingId = '0123456789abcdef01234567';
const city = revision => ({ city: { layoutVersion: 1, revision, buildings: [] }, inventory: [] });
const apiError = (status, code) => Object.assign(new Error('secret diagnostic'), { status, code });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function client() {
  const calls = [], replies = [], listeners = new Map();
  let sequence = 0, counter = 0;
  const target = { postMessage(data, origin) { assert.equal(origin, 'https://city.example'); replies.push(JSON.parse(JSON.stringify(data))); } };
  const frame = { contentWindow: target };
  const c = { calls, replies, frame, target, owner: 'owner', mutation: async () => ({ ...city(8), buildingId, replayed: false }),
    readCity: async () => city(7) };
  const request = async (url, options) => {
    calls.push({ url, options: options ? JSON.parse(JSON.stringify(options)) : undefined });
    if (options) return c.mutation(url, options);
    if (url === '/api/auth/me') return { user: { id: c.owner }, csrfToken: 'parent-only-secret' };
    if (url === '/api/city/catalog') return catalog;
    if (url === '/api/progress') return { totalXp: 20 };
    if (url === '/api/rewards') return { unlocks: [], inventory: [{ catalogId: 'wrong-snapshot', quantity: 999 }] };
    if (url === '/api/city') return c.readCity();
    assert.fail(url);
  };
  const window = { KnowledgeAuth: { request, me: () => request('/api/auth/me') },
    addEventListener(type, fn) { listeners.set(type, fn); }, removeEventListener(type) { listeners.delete(type); } };
  vm.runInNewContext(source, { window, location: { origin: 'https://city.example' }, crypto: { randomUUID: () => `key-${++counter}` } });
  c.bridge = window.KnowledgeCityBridge.create({ frame });
  c.send = (type, payload, override = {}) => listeners.get('message')?.({ origin: 'https://city.example', source: target,
    data: { channel: 'knowledge-city', version: 1, requestId: ++sequence, type, ...(payload === undefined ? {} : { payload }) }, ...override });
  c.last = () => replies.at(-1);
  c.place = () => c.send('place', { catalogId: catalog.items[0].id, x: 3, y: 4 });
  return c;
}

test('bridge rejects forged envelopes, payloads, IDs and uninitialized mutations without API writes', async () => {
  const c = client();
  await c.send('initialize', undefined, { origin: 'https://foreign.example' });
  await c.send('initialize', undefined, { source: {} });
  await c.send('initialize', undefined, { data: { channel: 'knowledge-city-preview', version: 1, type: 'initialize', requestId: 1 } });
  await c.send('place', { catalogId: catalog.items[0].id, x: 2, y: 3, revision: 99 });
  await c.send('move', { buildingId: '../notes', x: 2, y: 3 });
  await c.send('remove', { buildingId, ownerId: 'other' });
  await c.send('initialize', undefined, { data: { channel: 'knowledge-city', version: 1, type: 'initialize', requestId: NaN } });
  assert.equal(c.calls.length, 0); assert.equal(c.replies.length, 0);
  await c.place(); assert.equal(c.last().code, 'CITY_NOT_LOADED'); assert.equal(c.calls.length, 0);
});

test('bootstrap keeps tokens private and uses city snapshot inventory, mutation uses host revision and fixed routes', async () => {
  const c = client(); await c.send('initialize');
  assert.equal(c.last().ok, true); assert.deepEqual(c.last().state.inventory, []);
  assert.doesNotMatch(JSON.stringify(c.replies), /secret|csrfToken|owner|wrong-snapshot/);
  await c.place();
  let call = c.calls.at(-1);
  assert.equal(call.url, '/api/city/buildings'); assert.equal(call.options.method, 'POST');
  assert.deepEqual(JSON.parse(call.options.body), { revision: 7, x: 3, y: 4, rotation: 0, catalogId: catalog.items[0].id });
  await c.send('move', { buildingId, x: 6, y: 8 });
  call = c.calls.at(-1); assert.equal(call.url, `/api/city/buildings/${buildingId}`); assert.equal(call.options.method, 'PATCH');
  assert.equal(JSON.parse(call.options.body).revision, 8);
  await c.send('remove', { buildingId });
  assert.equal(c.calls.at(-1).options.method, 'DELETE'); assert.deepEqual(JSON.parse(c.calls.at(-1).options.body), { revision: 8 });
  const before = c.calls.length;
  await c.send('place', { catalogId: 'unknown', x: 1, y: 1 });
  await c.send('place', { catalogId: catalog.items[0].id, x: 32, y: 1 });
  assert.equal(c.calls.length, before);
});

test('uncertain responses keep identical key/body and block new edits until explicit retry succeeds', async () => {
  for (const error of [new Error('network secret'), apiError(503, 'DATABASE_UNAVAILABLE'), null]) {
    const c = client(); await c.send('initialize');
    c.mutation = async () => { if (error) throw error; return {}; };
    await c.place();
    const first = c.calls.at(-1);
    assert.equal(c.last().code, 'CITY_RETRY_REQUIRED'); assert.equal(c.last().retryable, true);
    assert.equal(c.last().state.city.revision, 7);
    await c.send('refresh'); await c.send('remove', { buildingId });
    assert.equal(c.calls.at(-1), first);
    c.mutation = async () => ({ ...city(10), buildingId, replayed: true });
    await c.send('retry');
    assert.deepEqual(c.calls.at(-1), first); assert.equal(c.last().state.city.revision, 10); assert.equal(c.last().replayed, true);
    await c.send('retry'); assert.equal(c.last().code, 'NO_PENDING_REQUEST');
    assert.doesNotMatch(JSON.stringify(c.replies), /secret/);
  }
});

test('conflict reload preserves draft without automatic mutation; failed reload locks edits', async () => {
  const c = client(); await c.send('initialize');
  c.mutation = async () => { throw apiError(409, 'CITY_CONFLICT'); };
  c.readCity = async () => city(12);
  await c.place();
  assert.equal(c.last().code, 'CITY_CONFLICT'); assert.equal(c.last().state.city.revision, 12);
  assert.equal(c.last().draft.payload.x, 3);
  assert.equal(c.calls.filter(call => call.options).length, 1);
  c.readCity = async () => { throw apiError(503, 'DATABASE_UNAVAILABLE'); };
  await c.place(); assert.equal(c.last().state, undefined);
  const count = c.calls.length; await c.place(); assert.equal(c.last().code, 'CITY_NOT_LOADED'); assert.equal(c.calls.length, count);
  c.readCity = async () => city(14); await c.send('refresh'); assert.equal(c.last().state.city.revision, 14);
});

test('session expiry or invalid CSRF clears pending requests and requires a new bridge', async () => {
  for (const error of [apiError(401, 'AUTH_REQUIRED'), apiError(403, 'CSRF_INVALID')]) {
    const c = client(); await c.send('initialize');
    c.mutation = async () => { throw error; }; await c.place();
    assert.equal(c.last().code, 'AUTH_REQUIRED'); assert.equal(c.last().state, undefined);
    const count = c.calls.length;
    await c.send('retry'); await c.send('initialize'); await c.send('refresh');
    assert.equal(c.calls.length, count); assert.equal(c.last().code, 'AUTH_REQUIRED');
  }
});

test('duplicate IDs cannot repeat commands; concurrent input is busy and dispose suppresses late replies', async () => {
  const c = client(); await c.send('initialize');
  const wait = deferred(); c.mutation = () => wait.promise;
  const writing = c.place();
  await c.send('remove', { buildingId }); assert.equal(c.last().code, 'BRIDGE_BUSY');
  await c.send('initialize', undefined, { data: { channel: 'knowledge-city', version: 1, requestId: 1, type: 'initialize' } });
  assert.equal(c.calls.filter(call => call.options).length, 1);
  c.bridge.dispose(); const count = c.replies.length;
  wait.resolve({ ...city(8), buildingId, replayed: false }); await writing;
  assert.equal(c.replies.length, count); assert.equal(c.send('initialize'), undefined);
});

test('account switch cannot replay an uncertain mutation or refresh an old bridge into a new owner', async () => {
  for (const command of ['retry', 'refresh']) {
    const c = client(); await c.send('initialize');
    if (command === 'retry') {
      c.mutation = async () => { throw new Error('lost response'); }; await c.place();
    }
    const writes = c.calls.filter(call => call.options).length;
    c.owner = 'different-owner'; await c.send(command);
    assert.equal(c.last().code, 'AUTH_REQUIRED'); assert.equal(c.last().state, undefined);
    assert.equal(c.calls.filter(call => call.options).length, writes);
    assert.doesNotMatch(JSON.stringify(c.replies), /different-owner/);
  }
});

test('replaced frame never receives results from the old bridge', async () => {
  const c = client(); const wait = deferred(); c.readCity = () => wait.promise;
  const loading = c.send('initialize'); c.frame.contentWindow = {};
  wait.resolve(city(7)); await loading;
  assert.equal(c.replies.length, 0); c.bridge.dispose();
});
