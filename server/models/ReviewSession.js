const mongoose = require('mongoose');
const cardSchema = new mongoose.Schema({
  noteId: { type: mongoose.Schema.Types.ObjectId, required: true },
  noteRevision: { type: Number, required: true, min: 0 },
  question: { type: String, required: false, default: '', maxlength: 200 },
  answer: { type: String, required: false, default: '', maxlength: 100000 },
  rating: { type: String, enum: ['again', 'remembered', null], default: null },
  reviewedAt: { type: Date, default: null }
}, { _id: false });
const receiptSchema = new mongoose.Schema({
  key: { type: String, required: true }, requestHash: { type: String, required: true }
}, { _id: false });
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  createKey: { type: String, required: true },
  createHash: { type: String, required: true },
  status: { type: String, enum: ['active', 'completed', 'closed'], default: 'active', required: true },
  revision: { type: Number, default: 0, required: true, min: 0 },
  nextIndex: { type: Number, default: 0, required: true, min: 0 },
  cards: { type: [cardSchema], required: true, validate: value => value.length >= 1 && value.length <= 20 },
  receipts: { type: [receiptSchema], default: [], validate: value => value.length <= 21 }
}, { timestamps: true });
schema.index({ userId: 1, createKey: 1 }, { unique: true });
schema.index({ userId: 1 }, { unique: true, partialFilterExpression: { status: 'active' } });
schema.index({ userId: 1, updatedAt: -1 });
module.exports = mongoose.model('ReviewSession', schema);
