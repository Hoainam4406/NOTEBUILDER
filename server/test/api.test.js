const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp } = require('../app');
const { noteQuery } = require('../validation');

let server, base;
let rows = new Map(), writes = 0, ready = true, fail = false, lastQuery;
const id = '0123456789abcdef01234567';
class FakeNote {
  constructor(data) { Object.assign(this, data); this.id = data.id || id; }
  async save() { if (fail) throw new Error('mongodb://secret:password@private'); writes++; rows.set(this.id, this); return this; }
  toJSON() { return { ...this }; }
  static find(query) { lastQuery = query; return { sort: async () => { if (fail) throw new Error('private'); return [...rows.values()]; } }; }
  static async findOne(query) { const row = rows.get(query._id); return row?.ownerId === query.ownerId ? row : null; }
  static async findOneAndUpdate(query, update) {
    const row = await this.findOne(query);
    if (!row || row.revision !== query.revision) return null;
    Object.assign(row, update.$set); row.revision++; return row;
  }
  static async findOneAndDelete(query) {
    const row = await this.findOne(query);
    if (!row || row.revision !== query.revision) return null;
    rows.delete(query._id); return row;
  }
  static async countDocuments() { return rows.size; }
}
before(async () => {
  const auth = { mount() {}, requireUser(req, res, next) { req.user = { _id: 'owner' }; next(); }, csrf(req, res, next) { next(); } };
  const progression = { async createNote(ownerId, input) { return { note: await new FakeNote({ ...input, ownerId, revision: 0 }).save(), replayed: false }; } };
  server = createApp({ NoteModel: FakeNote, auth, progression, dbReady: () => ready, logger: { error() {} } }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise(resolve => server.close(resolve)); });
async function request(path, method = 'GET', body) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'api-test-request-key' },
    body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}

test('health reports unavailable rather than online when DB is disconnected', async () => {
  ready = false;
  try {
    assert.equal((await request('/api/health')).status, 503);
    assert.equal((await request('/api/notes')).body.code, 'DATABASE_UNAVAILABLE');
  } finally { ready = true; }
  assert.equal((await request('/api/health')).status, 200);
});
test('create, read, patch, export and delete preserve the existing response shape', async () => {
  rows.clear();
  const created = await request('/api/notes', 'POST', { title: '  Vật lý  ', content: 'F = ma', tags: ['Toán', 'Toán'], canvasJSON: '{"objects":[]}' });
  assert.equal(created.status, 201);
  assert.equal(created.body.title, 'Vật lý');
  assert.deepEqual(created.body.tags, ['Toán']);
  assert.equal((await request(`/api/notes/${id}`)).body.content, 'F = ma');
  assert.equal((await request(`/api/notes/${id}`, 'PATCH', { content: 'E = mc²', revision: 0 })).body.title, 'Vật lý');
  assert.equal((await request(`/api/notes/${id}`, 'PUT', { title: 'Năng lượng', revision: 1 })).body.title, 'Năng lượng');
  assert.equal((await request('/api/godot/export')).body.notesCount, 1);
  assert.equal((await request(`/api/notes/${id}`, 'DELETE', { revision: 2 })).status, 200);
  assert.equal((await request(`/api/notes/${id}`)).status, 404);
});
for (const [label, payload] of Object.entries({
  'missing title': {}, 'numeric title': { title: 12 }, 'empty title': { title: '  ' },
  'title too long': { title: 'x'.repeat(201) }, 'object content': { title: 'Note', content: {} },
  'content too long': { title: 'Note', content: 'x'.repeat(100001) },
  'invalid tags': { title: 'Note', tags: 'a' }, 'invalid tag item': { title: 'Note', tags: [{}] },
  'too many tags': { title: 'Note', tags: Array(21).fill('a') },
  'invalid template': { title: 'Note', template: '5' },
  'invalid canvas JSON': { title: 'Note', canvasJSON: '{bad' },
  'canvas JSON array': { title: 'Note', canvasJSON: '[]' },
  'canvas object': { title: 'Note', canvasImage: {} }
})) {
  test(`reject ${label} before writes`, async () => {
    const beforeWrites = writes;
    const result = await request('/api/notes', 'POST', payload);
    assert.equal(result.status, 400);
    assert.equal(result.body.code, 'INVALID_INPUT');
    assert.equal(writes, beforeWrites);
  });
}
test('partial update cannot clear title or inject extra fields', async () => {
  await request('/api/notes', 'POST', { title: 'Note', totalXp: 999, ownerId: 'attacker' });
  assert.equal(rows.get(id).totalXp, undefined);
  assert.equal(rows.get(id).ownerId, 'owner');
  assert.equal((await request(`/api/notes/${id}`, 'PUT', { title: '' })).status, 400);
  assert.equal(rows.get(id).title, 'Note');
});
test('invalid IDs are 400 across read/update/delete; missing IDs are 404', async () => {
  for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) {
    assert.equal((await request('/api/notes/bad-id', method, method === 'PUT' || method === 'PATCH' ? { title: 'A' } : undefined)).status, 400);
  }
  assert.equal((await request('/api/notes/ffffffffffffffffffffffff')).status, 404);
});
test('search escapes regex metacharacters and rejects query operators', async () => {
  assert.equal((await request('/api/notes?search=%5B%2E%2A')).status, 200);
  const regex = lastQuery.$or[0].title;
  assert.equal(regex.test('[.*'), true);
  assert.equal(regex.test('anything'), false);
  assert.equal((await request('/api/notes?search=a&search=b')).status, 400);
  assert.equal((await request('/api/notes?template=5')).status, 400);
  assert.throws(() => noteQuery({ search: { $ne: '' } }));
});
test('legacy automatic migration is disabled without writing notes', async () => {
  const beforeWrites = writes;
  assert.equal((await request('/api/notes/migrate', 'POST', { notes: [{ title: 'Valid' }, { title: 3 }] })).status, 410);
  assert.equal(writes, beforeWrites);
  assert.equal((await request('/api/notes/migrate', 'POST', { notes: [] })).body.code, 'IMPORT_DISABLED');
});
test('malformed JSON has a consistent error response', async () => {
  const response = await fetch(base + '/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'INVALID_INPUT');
});
test('internal failures never reveal database credentials', async () => {
  fail = true;
  try {
    const response = await request('/api/notes', 'POST', { title: 'Valid' });
    assert.equal(response.status, 500);
    assert.equal(response.body.code, 'INTERNAL_ERROR');
    assert.doesNotMatch(JSON.stringify(response.body), /secret|password|mongodb/);
  } finally { fail = false; }
});
test('unknown API route returns JSON 404', async () => {
  assert.equal((await request('/api/missing')).body.code, 'NOT_FOUND');
});
