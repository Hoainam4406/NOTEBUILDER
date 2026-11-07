const { test, before, after } = require('node:test');
const { once } = require('node:events');
const assert = require('node:assert/strict');
const { createApp } = require('../app');
let server, base;
before(async () => {
  server = createApp({ dbReady: () => false }).listen(0, '127.0.0.1');
  await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`;
});

test('authenticated city page loads auth and bridge before host without claiming anonymous persistence', async () => {
  const response = await fetch(base + '/city.html'); assert.equal(response.status, 200);
  const html = await response.text(); assert.match(html, /data-mode="city"/);
  assert.ok(html.indexOf('js/auth.js') < html.indexOf('js/city-bridge.js'));
  assert.ok(html.indexOf('js/city-bridge.js') < html.indexOf('js/game.js'));
  assert.match(await (await fetch(base + '/notes.html')).text(), /href="city.html"/);
  assert.equal((await fetch(base + '/game-city-build/missing.wasm')).status, 404);
});
after(() => new Promise(resolve => server.close(resolve)));

test('review page is reachable without DB and links to notes/account with accessible controls and onboarding', async () => {
  const response = await fetch(base + '/review.html'); assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.indexOf('js/auth.js') < html.indexOf('js/review.js'));
  assert.match(html, /aria-live="polite"/); assert.match(html, /aria-controls="cardAnswer"/); assert.match(html, /không cộng XP/);
  const notes = await (await fetch(base + '/notes.html')).text();
  assert.match(notes, /href="review.html"/); assert.match(notes, /Hướng dẫn bắt đầu Knowledge City/);
});
test('game preview shell and navigation are served even without a database', async () => {
  const response = await fetch(base + '/game.html'); assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /chưa đồng bộ với ghi chú và tài khoản/);
  assert.match(html, /js\/game.js/);
  assert.match(await (await fetch(base + '/index.html')).text(), /href="game.html"/);
  assert.equal((await fetch(base + '/api/city')).status, 503);
  assert.equal((await fetch(base + '/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"title":"No write"}' })).status, 503);
});
