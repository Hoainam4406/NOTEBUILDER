const { createApp } = require('./app');
const port = Number(process.env.PREVIEW_PORT || 5050);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PREVIEW_PORT không hợp lệ');
// Local read-only preview. Never load .env, connect MongoDB, seed or enable writes.
createApp({ dbReady: () => false }).listen(port, '127.0.0.1', () => {
  console.log(`Knowledge City preview: http://127.0.0.1:${port}/game.html`);
});
