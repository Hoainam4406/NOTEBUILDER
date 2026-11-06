const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  key: { type: String, required: true },
  requestHash: { type: String, required: true },
  buildingId: { type: String, required: true },
  createdAt: { type: Date, required: true }
});
schema.index({ userId: 1, key: 1 }, { unique: true });
module.exports = mongoose.model('CityMutation', schema);
