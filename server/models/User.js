const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  displayName: { type: String, required: true },
  passwordHash: { type: String, required: true, select: false }
}, { timestamps: true });
module.exports = mongoose.model('User', schema);
