const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  kind: { type: String, required: true, enum: ['achievement', 'quest'] },
  period: { type: String, required: true },
  entryId: { type: String, required: true },
  claimedAt: { type: Date, required: true }
});
schema.index({ userId: 1, kind: 1, period: 1, entryId: 1 }, { unique: true });
module.exports = mongoose.model('JourneyClaim', schema);
