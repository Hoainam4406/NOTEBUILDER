const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  eventKey: { type: String, required: true },
  payloadHash: { type: String, required: true },
  noteId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Note' },
  policyVersion: { type: Number, required: true },
  amount: { type: Number, required: true, min: 0, max: 20 },
  reason: { type: String, enum: ['awarded', 'draft', 'duplicate_content', 'daily_cap'], required: true },
  fingerprint: { type: String, default: null },
  day: { type: String, required: true },
  createdAt: { type: Date, required: true }
});
schema.index({ userId: 1, eventKey: 1 }, { unique: true });
schema.index({ userId: 1, day: 1 });
module.exports = mongoose.model('XpEvent', schema);
