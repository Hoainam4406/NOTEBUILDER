const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp } = require('../app');
const { createAuth } = require('../auth');
const rows = new Map();
const id = '0123456789abcdef01234567';
const otherId = 'ffffffffffffffffffffffff';
const matches = (row, query) => row && Object.entries(query).every(([key, value]) => key === '$or' || row[key] === value);
class NoteModel {
  constructor(data) { Object.assign(this, { _id: id }, data); }
  async save() { rows.set(this._id, this); return this; }
  toJSON() { const { ownerId, _id, ...data } = this; return { id: _id, ...data }; }
  static find(query) { return { sort: async () => [...rows.values()].filter(row => matches(row, query)) }; }
  static async findOne(query) { return [...rows.values()].find(row => matches(row, query)); }
  static async findOneAndUpdate(query, update) { const row = await this.findOne(query); if (!row) return null; Object.assign(row, update.$set); row.revision++; return row; }
  static async findOneAndDelete(query) { const row = await this.findOne(query); if (!row) return null; rows.delete(row._id); return row; }
}
// Actual auth middleware with controlled persistent-store fixtures.
const UserModel = { async findById(id) { return { _id: id }; } };
const { digest } = require('../auth');
const SessionModel = { async findOne(query) {
  const user = query.tokenHash === digest('a'.repeat(64)) ? 'A' : query.tokenHash === digest('b'.repeat(64)) ? 'B' : null;
  return user && { userId: user, csrfToken: 'csrf' };
} };
let server, base;
before(async () => {
  const progression = { async createNote(ownerId, input) { return { note: await new NoteModel({ ...input, ownerId, revision: 0 }).save(), replayed: false }; } };
  server = createApp({ NoteModel, progression, dbReady: () => true, auth: createAuth({ UserModel, SessionModel }) }).listen(0, '127.0.0.1');
  await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));
async function request(path, method = 'GET', body, user = 'A', csrf = 'csrf') {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'ownership-request-key',
    ...(user ? { Cookie: `kc_session=${user.toLowerCase().repeat(64)}`, 'X-CSRF-Token': csrf } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
test('all note and export routes reject anonymous access', async () => {
  for (const [path, method] of [['/api/notes', 'GET'], ['/api/notes', 'POST'], [`/api/notes/${id}`, 'GET'], [`/api/notes/${id}`, 'PATCH'], [`/api/notes/${id}`, 'DELETE'], ['/api/godot/export', 'GET'], ['/api/notes/migrate', 'POST']]) {
    assert.equal((await request(path, method, undefined, null)).status, 401);
  }
});
test('authenticated create assigns owner and revision on server and checks CSRF', async () => {
  assert.equal((await request('/api/notes', 'POST', { title: 'Private' }, 'A', 'wrong')).status, 403);
  assert.equal(rows.size, 0);
  const result = await request('/api/notes', 'POST', { title: 'Private', ownerId: 'B', revision: 99 });
  assert.equal(result.status, 201); assert.equal(result.body.revision, 0);
  assert.equal(rows.get(id).ownerId, 'A'); assert.equal(result.body.ownerId, undefined);
  rows.set(otherId, new NoteModel({ _id: otherId, title: 'Legacy unowned note', revision: 0 }));
});
test('AUTH-04 foreign and unowned notes are hidden on get/list/search/export/update/delete', async () => {
  for (const target of [id, otherId]) {
    for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) {
      assert.equal((await request(`/api/notes/${target}`, method, method === 'GET' ? undefined : { title: 'Attack', revision: 0 }, 'B')).status, 404);
    }
  }
  assert.deepEqual((await request('/api/notes', 'GET', undefined, 'B')).body, []);
  assert.deepEqual((await request('/api/notes?search=Private', 'GET', undefined, 'B')).body, []);
  assert.equal((await request('/api/godot/export', 'GET', undefined, 'B')).body.notesCount, 0);
  assert.equal((await request('/api/notes')).body.length, 1);
  assert.equal(rows.get(id).title, 'Private'); assert.equal(rows.size, 2);
});
test('NOTE-05 concurrent stale writes allow one winner and retain revision', async () => {
  const results = await Promise.all(['Tab 1', 'Tab 2'].map(title => request(`/api/notes/${id}`, 'PATCH', { title, revision: 0 })));
  assert.deepEqual(results.map(row => row.status).sort(), [200, 409]);
  assert.equal(rows.get(id).revision, 1);
  const winner = results.find(row => row.status === 200).body;
  assert.equal((await request(`/api/notes/${id}`)).body.title, winner.title);
  assert.equal((await request(`/api/notes/${id}`, 'DELETE', { revision: 0 })).status, 409);
  assert.equal((await request(`/api/notes/${id}`, 'PATCH', { title: 'New', revision: 1 })).body.revision, 2);
});
test('missing/invalid revisions fail before mutation; current revision deletes', async () => {
  for (const revision of [undefined, -1, '2', 1.5, Number.MAX_SAFE_INTEGER]) {
    assert.equal((await request(`/api/notes/${id}`, 'PATCH', { title: 'Bad', revision })).status, 400);
    assert.equal((await request(`/api/notes/${id}`, 'DELETE', { revision })).status, 400);
  }
  assert.equal(rows.get(id).revision, 2);
  assert.equal((await request(`/api/notes/${id}`, 'DELETE', { revision: 2 })).status, 200);
  assert.equal((await request(`/api/notes/${id}`)).status, 404);
});
test('public health never exposes note count and migration cannot claim unowned notes', async () => {
  const health = await request('/api/health', 'GET', undefined, null);
  assert.equal(health.status, 200); assert.equal(health.body.totalNotes, undefined);
  assert.equal((await request('/api/notes/migrate', 'POST', { notes: [{ id: otherId }] })).status, 410);
  assert.equal(rows.get(otherId).ownerId, undefined);
});
