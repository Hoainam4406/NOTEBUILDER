// Local acceptance smoke: real configured MongoDB/startup, no demo/domain writes.
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const mongoose = require('mongoose');
const pinned = require('../game-source.json');

async function checkLocal() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  // A temporary port and no browser launch; never edit the user's .env.
  process.env.PORT = String(port); process.env.AUTO_OPEN = 'false';
  const { startServer } = require('../index');
  let server, failed = false;
  function report(label, ok) { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) failed = true; }
  try {
    server = await startServer();
    if (!server.listening) await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const origin = `http://127.0.0.1:${port}`;
    for (const route of ['/', '/notes.html', '/review.html', '/journey.html', '/city.html', '/account.html']) {
      const response = await fetch(origin + route, { signal: AbortSignal.timeout(10000) });
      report(`page ${route}`, response.status === 200); await response.arrayBuffer();
    }
    const health = await fetch(origin + '/api/health', { signal: AbortSignal.timeout(10000) });
    report('configured MongoDB / startup transaction and index gate', health.ok && (await health.json()).status === 'online');
    for (const route of ['/api/notes', '/api/drafts', '/api/journey', '/api/city', '/api/reviews']) {
      const response = await fetch(origin + route, { signal: AbortSignal.timeout(10000) });
      const body = await response.json(); report(`anonymous isolation ${route}`, response.status === 401 && body.code === 'AUTH_REQUIRED');
    }
    for (const mode of ['game-build', 'game-city-build']) {
      const folder = path.resolve(__dirname, '../../notegame-web', mode);
      try {
        const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'build.json'), 'utf8'));
        report(`${mode} pinned clean source`, manifest.version === 1 && manifest.gameCommit === pinned.commit && manifest.sourceDirty === false && manifest.engine === pinned.engine && manifest.preview === (mode === 'game-build'));
        if (mode === 'game-city-build') report(`${mode} bridge version`, manifest.bridgeVersion === 1);
        for (const name of ['index.html', 'index.js', 'index.wasm', 'index.pck']) {
          const entry = manifest.files?.find(file => file.name === name), buffer = fs.readFileSync(path.join(folder, name));
          report(`${mode}/${name} checksum`, !!entry && entry.bytes === buffer.length && entry.sha256 === createHash('sha256').update(buffer).digest('hex'));
          const response = await fetch(`${origin}/${mode}/${name}`, { method: 'HEAD', signal: AbortSignal.timeout(10000) });
          const type = response.headers.get('content-type') || '';
          report(`${mode}/${name} HTTP/MIME`, response.ok && (name.endsWith('.wasm') ? type.includes('application/wasm') : name.endsWith('.pck') ? type.includes('application/octet-stream') : true));
        }
      } catch { report(`${mode} artifacts present/readable (see docs/WEB_GAME.md)`, false); }
    }
    console.log('No account/note/draft/XP/city mutations or seed. Startup may create missing schema indexes.');
    console.log('This smoke does not replace authenticated browser E2E, UAT or deployment checks.');
    return !failed;
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
  }
}
if (require.main === module) checkLocal().then(ok => { process.exitCode = ok ? 0 : 1; }).catch(async error => {
  console.error(error.code === 'TRANSACTIONS_REQUIRED' ? 'FAIL MongoDB transactions required' : 'FAIL local startup/configuration; check MongoDB and the configured runtime.');
  await mongoose.disconnect(); process.exitCode = 1;
});
module.exports = { checkLocal };
