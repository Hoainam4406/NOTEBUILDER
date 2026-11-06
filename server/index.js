const mongoose = require('mongoose');
const path = require('node:path');
const { execFile } = require('node:child_process');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { createApp } = require('./app');

async function startServer() {
  const port = Number(process.env.PORT || 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT không hợp lệ');
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/notebuilder_db');
  const server = createApp().listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(`NOTEBUILDER: ${url}`);
    if (process.argv.includes('--open') || process.env.AUTO_OPEN === 'true') {
      if (process.platform === 'win32') execFile('cmd', ['/c', 'start', '', url], () => {});
      else execFile(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], () => {});
    }
  });
  // Seed only via npm run seed; production startup must not insert demo notes.
  return server;
}
if (require.main === module) {
  startServer().catch(() => { console.error('Không thể khởi động server; kiểm tra cấu hình và MongoDB.'); process.exitCode = 1; });
}
module.exports = { startServer };
