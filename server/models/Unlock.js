const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  rewardId: { type: String, required: true },
  catalogId: { type: String, required: true },
  level: { type: Number, required: true },
  grantedAt: { type: Date, required: true }
});
schema.index({ userId: 1, rewardId: 1 }, { unique: true });
module.exports = mongoose.model('Unlock', schema);
