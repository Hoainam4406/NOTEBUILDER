const path = require('node:path');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server-core');

// Never read MONGODB_URI or .env: every run owns a fresh loopback-only database.
async function startTestDatabase() {
  const replica = await MongoMemoryReplSet.create({
    binary: { version: '8.2.6', downloadDir: path.join(__dirname, '../../node_modules/.cache/mongodb-binaries') },
    replSet: { count: 1, ip: '127.0.0.1', storageEngine: 'wiredTiger' }
  });
  const uri = replica.getUri('knowledge_city_test');
  try {
    await mongoose.connect(uri);
    await Promise.all(Object.values(mongoose.models).map(model => model.init()));
  } catch (error) {
    await mongoose.disconnect();
    await replica.stop();
    throw error;
  }
  return { uri, async stop() { await mongoose.disconnect(); await replica.stop(); } };
}
module.exports = { startTestDatabase };
