// Disposable browser verification server. Never reads .env or an external URI.
const { once } = require('node:events');
const http = require('node:http');
const { createApp } = require('../../app');
const { startTestDatabase } = require('./mongo');

async function start() {
  const database = await startTestDatabase();
  const app = createApp();
  let fault = null;
  const server = http.createServer((req, res) => {
    const mutation = ['POST', 'PATCH', 'DELETE'].includes(req.method) && req.url.startsWith('/api/city/buildings');
    if (mutation && fault === 'fail') {
      fault = null;
      res.writeHead(503, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Test outage', code: 'DATABASE_UNAVAILABLE' }));
    }
    if (mutation && fault === 'drop') {
      fault = null;
      const end = res.end;
      res.end = function (...args) {
        if (res.statusCode >= 200 && res.statusCode < 300) { res.socket.destroy(); return res; }
        return end.apply(this, args);
      };
    }
    app(req, res);
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  console.log(`Disposable browser server: http://127.0.0.1:${server.address().port}`);
  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    await new Promise(resolve => server.close(resolve));
    await database.stop();
    process.exit(0);
  }
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  let input = '';
  process.stdin.on('data', async data => {
    input += String(data);
    while (input.includes('\n')) {
      const index = input.indexOf('\n');
      const command = input.slice(0, index).trim(); input = input.slice(index + 1);
      if (command === 'stop') await stop();
      else if (command === 'drop-next-city-response') { fault = 'drop'; console.log('Armed: drop committed city response'); }
      else if (command === 'fail-next-city') { fault = 'fail'; console.log('Armed: reject next city write with 503'); }
      else if (command === 'expire-sessions') {
        await require('../../models/Session').deleteMany({}); console.log('Expired disposable test sessions');
      } else if (command === 'snapshot') {
        const cities = await require('../../models/City').find({}).lean();
        const inventory = await require('../../models/Inventory').find({}).lean();
        const progress = await require('../../models/Progress').find({}).lean();
        const receipts = await require('../../models/CityMutation').countDocuments({});
        console.log(JSON.stringify({ cities, inventory, progress, receipts }));
      }
    }
  });
  process.stdin.resume();
}
if (require.main === module) start().catch(() => { console.error('Browser test server failed to start'); process.exit(1); });
