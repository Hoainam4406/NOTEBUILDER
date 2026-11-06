const { test, before, after } = require('node:test');
const { once } = require('node:events');
const assert = require('node:assert/strict');
const { createApp } = require('../app');
let server, base;
before(async () => {
  server = createApp({ dbReady: () => false }).listen(0, '127.0.0.1');
  await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));
test('game preview shell and navigation are served even without a database', async () => {
  const response = await fetch(base + '/game.html'); assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /chưa đồng bộ với ghi chú và tài khoản/);
  assert.match(html, /js\/game.js/);
  assert.match(await (await fetch(base + '/index.html')).text(), /href="game.html"/);
  assert.equal((await fetch(base + '/api/city')).status, 503);
  assert.equal((await fetch(base + '/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"title":"No write"}' })).status, 503);
});
