const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User', index: true },
  csrfToken: { type: String, required: true },
  expiresAt: { type: Date, required: true, expires: 0 }
});
module.exports = mongoose.model('Session', schema);
