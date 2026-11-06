const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  fingerprint: { type: String, required: true }
});
schema.index({ userId: 1, fingerprint: 1 }, { unique: true });
module.exports = mongoose.model('XpFingerprint', schema);
