const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  draftId: { type: String, required: true },
  revision: { type: Number, required: true },
  lastHash: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true }
}, { timestamps: true });
schema.index({ userId: 1, draftId: 1 }, { unique: true });
schema.index({ userId: 1, updatedAt: -1 });
module.exports = mongoose.model('NoteDraft', schema);
