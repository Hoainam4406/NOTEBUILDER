const mongoose = require('mongoose');
const placement = new mongoose.Schema({
  id: { type: String, required: true, match: /^[a-f0-9]{24}$/ },
  catalogId: { type: String, required: true },
  x: { type: Number, required: true, min: 0, max: 31, validate: Number.isSafeInteger },
  y: { type: Number, required: true, min: 0, max: 31, validate: Number.isSafeInteger },
  rotation: { type: Number, required: true, enum: [0] }
}, { _id: false });
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true, ref: 'User' },
  layoutVersion: { type: Number, required: true, default: 1, enum: [1] },
  revision: { type: Number, required: true, default: 0, min: 0, validate: Number.isSafeInteger },
  buildings: { type: [placement], default: [], validate: value => value.length <= 256 }
});
module.exports = mongoose.model('City', schema);
