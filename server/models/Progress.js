const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true, ref: 'User' },
  totalXp: { type: Number, required: true, default: 0, min: 0, validate: Number.isSafeInteger },
  revision: { type: Number, required: true, default: 0, min: 0 }
});
module.exports = mongoose.model('Progress', schema);
