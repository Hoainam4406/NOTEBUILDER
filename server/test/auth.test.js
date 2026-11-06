const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp } = require('../app');
const { createAuth, digest, hashPassword, verifyPassword } = require('../auth');
const users = new Map(), sessions = new Map(), attempts = new Map();
let clock = Date.now(), server, base, cookie, csrf;
const UserModel = {
  async create(data) {
    if ([...users.values()].some(user => user.email === data.email)) throw Object.assign(new Error(), { code: 11000 });
    const user = { _id: String(users.size + 1), ...data }; users.set(user._id, user); return user;
  },
  findOne({ email }) { return { select: async () => [...users.values()].find(user => user.email === email) }; },
  async findById(id) { return users.get(id); },
  async findByIdAndUpdate(id, update) { Object.assign(users.get(id), update.$set); return users.get(id); }
};
const SessionModel = {
  async create(data) { const row = { _id: String(sessions.size + 1), ...data }; sessions.set(row._id, row); return row; },
  async findOne(query) { return [...sessions.values()].find(row => row.tokenHash === query.tokenHash && row.expiresAt > query.expiresAt.$gt); },
  async deleteOne({ _id }) { sessions.delete(_id); }
};
const AttemptModel = {
  async findOneAndUpdate({ key }) { const count = (attempts.get(key)?.count || 0) + 1; const row = { count }; attempts.set(key, row); return row; }
};
before(async () => {
  server = createApp({ dbReady: () => true, auth: createAuth({ UserModel, SessionModel, AttemptModel, now: () => clock, secure: true }) }).listen(0, '127.0.0.1');
  await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));
async function request(path, method = 'GET', body, authenticated = false) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json',
    ...(authenticated ? { Cookie: cookie, 'X-CSRF-Token': csrf } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: response.status === 204 ? null : await response.json(), headers: response.headers };
}
const account = { email: '  Student@EXAMPLE.com ', password: 'a secure password 123', displayName: ' Học sinh ' };
test('AUTH-01 register normalizes email/name and stores salted hash only', async () => {
  const response = await request('/api/auth/register', 'POST', account);
  assert.equal(response.status, 201);
  assert.deepEqual(response.body.user, { id: '1', email: 'student@example.com', displayName: 'Học sinh' });
  assert.notEqual(users.get('1').passwordHash, account.password);
  assert.ok(await verifyPassword(account.password, users.get('1').passwordHash));
  assert.doesNotMatch(JSON.stringify(response.body), /password|scrypt/);
  assert.notEqual(await hashPassword(account.password), users.get('1').passwordHash);
});
test('AUTH-02 duplicate normalized email is 409', async () => {
  const result = await request('/api/auth/register', 'POST', { ...account, email: 'student@example.com' });
  assert.equal(result.status, 409); assert.equal(users.size, 1);
});
test('input validation rejects weak passwords, invalid emails and blank names', async () => {
  for (const body of [{ ...account, password: 'short' }, { ...account, email: 'bad' }, { ...account, email: 'a@@b.com' }, { ...account, displayName: ' ' }]) {
    assert.equal((await request('/api/auth/register', 'POST', body)).status, 400);
  }
});
test('login failure does not disclose whether account exists', async () => {
  const wrong = await request('/api/auth/login', 'POST', { ...account, password: 'wrong password 123' });
  const absent = await request('/api/auth/login', 'POST', { ...account, email: 'absent@example.com' });
  assert.equal(wrong.status, 401); assert.deepEqual(wrong.body, absent.body);
});
test('session cookie is secure/HttpOnly/Strict; only token hash is stored', async () => {
  const response = await request('/api/auth/login', 'POST', account);
  assert.equal(response.status, 200);
  cookie = response.headers.get('set-cookie').split(';')[0]; csrf = response.body.csrfToken;
  assert.match(response.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Strict/);
  const raw = cookie.split('=')[1];
  assert.equal([...sessions.values()][0].tokenHash, digest(raw));
  assert.doesNotMatch(JSON.stringify([...sessions.values()]), new RegExp(raw));
  assert.equal((await request('/api/auth/me', 'GET', undefined, true)).body.user.id, '1');
  assert.equal((await request('/api/auth/me')).status, 401);
});
test('profile and logout require CSRF; profile cannot replace email/password', async () => {
  const wrongCsrf = await fetch(base + '/api/profile', { method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: 'X' }) });
  assert.equal(wrongCsrf.status, 403);
  const response = await request('/api/profile', 'PATCH', { displayName: 'Tên mới', email: 'evil@example.com', passwordHash: 'bad' }, true);
  assert.equal(response.status, 200); assert.equal(response.body.user.email, 'student@example.com');
  assert.equal(response.body.user.displayName, 'Tên mới');
  assert.equal((await request('/api/auth/logout', 'POST', undefined, true)).status, 204);
  assert.equal((await request('/api/auth/me', 'GET', undefined, true)).status, 401);
});
test('AUTH-03 rate limit is shared across requests and sends retry-after', async () => {
  attempts.clear();
  for (let i = 0; i < 10; i++) assert.equal((await request('/api/auth/login', 'POST', { ...account, email: 'limited@example.com' })).status, 401);
  const limited = await request('/api/auth/login', 'POST', { ...account, email: 'limited@example.com' });
  assert.equal(limited.status, 429); assert.equal(limited.body.code, 'RATE_LIMITED'); assert.ok(Number(limited.headers.get('retry-after')) > 0);
  clock += 15 * 60 * 1000;
  assert.equal((await request('/api/auth/login', 'POST', { ...account, email: 'limited@example.com' })).status, 401);
});
test('expired sessions are rejected even before Mongo TTL cleanup', async () => {
  const response = await request('/api/auth/login', 'POST', account);
  cookie = response.headers.get('set-cookie').split(';')[0]; csrf = response.body.csrfToken;
  clock += 7 * 24 * 60 * 60 * 1000 + 1;
  assert.equal((await request('/api/auth/me', 'GET', undefined, true)).status, 401);
  assert.equal((await request('/api/profile', 'PATCH', { displayName: 'Bad' }, true)).status, 401);
});
