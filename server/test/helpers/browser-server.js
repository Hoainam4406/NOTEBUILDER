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
    const reviewMutation = req.method === 'POST' && (req.url === '/api/reviews' || req.url.startsWith('/api/reviews/'));
    const journeyMutation = req.method === 'PUT' && req.url.startsWith('/api/journey/');
    const draftMutation = req.method === 'PUT' && req.url.startsWith('/api/drafts/');
    const noteMutation = ['POST', 'PUT'].includes(req.method) && (req.url === '/api/notes' || req.url.startsWith('/api/notes/'));
    if ((reviewMutation && fault === 'review-fail') || (journeyMutation && fault === 'journey-fail') || (draftMutation && fault === 'draft-fail')) {
      fault = null;
      res.writeHead(503, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Test outage', code: 'DATABASE_UNAVAILABLE' }));
    }
    if ((reviewMutation && fault === 'review-drop') || (journeyMutation && fault === 'journey-drop') || (noteMutation && fault === 'note-drop')) {
      fault = null;
      const end = res.end;
      res.end = function (...args) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // Send a partial response so browser HTTP retry cannot hide the fault.
          res.flushHeaders(); res.write('{"interrupted":');
          setTimeout(() => res.destroy(), 100);
          console.log('Dropped test response after commit');
          return res;
        }
        return end.apply(this, args);
      };
    }
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
  let commands = Promise.resolve();
  async function processInput() {
    while (input.includes('\n')) {
      const index = input.indexOf('\n');
      const command = input.slice(0, index).trim(); input = input.slice(index + 1);
      if (command === 'stop') await stop();
      else if (command === 'drop-next-city-response') { fault = 'drop'; console.log('Armed: drop committed city response'); }
      else if (command === 'fail-next-city') { fault = 'fail'; console.log('Armed: reject next city write with 503'); }
      else if (command === 'fail-next-review') { fault = 'review-fail'; console.log('Armed: reject next review write with 503'); }
      else if (command === 'drop-next-review-response') { fault = 'review-drop'; console.log('Armed: drop committed review response'); }
      else if (command === 'fail-next-journey') { fault = 'journey-fail'; console.log('Armed: reject next journey claim with 503'); }
      else if (command === 'drop-next-journey-response') { fault = 'journey-drop'; console.log('Armed: drop committed journey response'); }
      else if (command === 'fail-next-draft') { fault = 'draft-fail'; console.log('Armed: reject next draft save'); }
      else if (command === 'drop-next-note-response') { fault = 'note-drop'; console.log('Armed: drop committed note response'); }
      else if (command === 'draft-snapshot') {
        const rows = await require('../../models/NoteDraft').find({}).lean();
        console.log(JSON.stringify({ drafts: rows.map(row => ({ id: row.draftId, revision: row.revision, title: row.data.fields.title,
          hasCanvas: !!row.data.fields.canvasJSON, pendingMethod: row.data.pending?.method || null })),
          notes: await require('../../models/Note').countDocuments(), events: await require('../../models/XpEvent').countDocuments() }));
      }
      else if (command === 'journey-snapshot') {
        const claims = await require('../../models/JourneyClaim').find({}).select('kind period entryId claimedAt -_id').lean();
        console.log(JSON.stringify({ claims }));
      }
      else if (command === 'expire-sessions') {
        await require('../../models/Session').deleteMany({}); console.log('Expired disposable test sessions');
      } else if (command === 'snapshot') {
        const cities = await require('../../models/City').find({}).lean();
        const inventory = await require('../../models/Inventory').find({}).lean();
        const progress = await require('../../models/Progress').find({}).lean();
        const receipts = await require('../../models/CityMutation').countDocuments({});
        console.log(JSON.stringify({ cities, inventory, progress, receipts }));
      } else if (command === 'review-snapshot') {
        const rows = await require('../../models/ReviewSession').find({}).lean();
        console.log(JSON.stringify(rows.map(row => ({ id: String(row._id), status: row.status, revision: row.revision,
          nextIndex: row.nextIndex, total: row.cards.length, receipts: row.receipts.length,
          retainedText: row.cards.some(card => card.question || card.answer) }))));
      }
    }
  }
  process.stdin.on('data', data => {
    input += String(data);
    // Serialize async inspections before teardown, even across stdin chunks.
    commands = commands.then(processInput).catch(async () => {
      console.error('Browser fixture command failed'); await stop();
    });
  });
  process.stdin.resume();
}
if (require.main === module) start().catch(() => { console.error('Browser test server failed to start'); process.exit(1); });
