// Child process used only by the isolated DB suite; no production startup/.env.
const mongoose = require('mongoose');
const { createApp } = require('../../app');
let server;
async function start() {
  const uri = process.env.KC_TEST_MONGO_URI;
  if (!uri?.startsWith('mongodb://127.0.0.1:') || !uri.includes('/knowledge_city_test?')) throw new Error('Test database required');
  await mongoose.connect(uri);
  server = createApp().listen(0, '127.0.0.1', () => process.send({ port: server.address().port }));
}
process.on('message', async message => {
  if (message !== 'stop') return;
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect();
  process.exit(0);
});
start().catch(() => { process.send?.({ error: 'Test API startup failed' }); process.exit(1); });
