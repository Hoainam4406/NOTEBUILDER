const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  catalogId: { type: String, required: true },
  quantity: { type: Number, required: true, min: 0, validate: Number.isSafeInteger }
});
schema.index({ userId: 1, catalogId: 1 }, { unique: true });
module.exports = mongoose.model('Inventory', schema);
