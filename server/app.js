const express = require('express');
const path = require('node:path');
const mongoose = require('mongoose');
const Note = require('./models/Note');
const { InputError, noteInput, objectId, noteQuery } = require('./validation');
const { createAuth } = require('./auth');

function createApp({ NoteModel = Note, auth = createAuth(), dbReady = () => mongoose.connection.readyState === 1, logger = console } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '25mb' }));
  app.use(express.static(path.join(__dirname, '..', 'notegame-web')));
  app.get('/api/health', async (req, res) => {
    const connected = dbReady();
    res.set('Cache-Control', 'no-store');
    res.status(connected ? 200 : 503).json({ status: connected ? 'online' : 'unavailable',
      database: connected ? 'MongoDB Connected' : 'Disconnected', timestamp: new Date().toISOString() });
  });
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!dbReady()) return res.status(503).json({ error: 'Cơ sở dữ liệu chưa sẵn sàng', code: 'DATABASE_UNAVAILABLE' });
    next();
  });
  auth.mount(app);
  app.use(['/api/notes', '/api/godot'], auth.requireUser, auth.csrf);
  app.get('/api/notes', async (req, res) => {
    const notes = await NoteModel.find({ ...noteQuery(req.query), ownerId: req.user._id }).sort({ createdAt: -1 });
    res.json(notes.map(note => note.toJSON()));
  });
  app.post('/api/notes/migrate', (req, res) => {
    res.status(410).json({ error: 'Import tự động đã tắt để bảo vệ dữ liệu trên thiết bị dùng chung', code: 'IMPORT_DISABLED' });
  });
  app.get('/api/notes/:id', async (req, res) => {
    const note = await NoteModel.findOne({ _id: objectId(req.params.id), ownerId: req.user._id });
    if (!note) return res.status(404).json({ error: 'Không tìm thấy ghi chú', code: 'NOTE_NOT_FOUND' });
    res.json(note.toJSON());
  });
  app.post('/api/notes', async (req, res) => {
    const note = await new NoteModel({ ...noteInput(req.body), ownerId: req.user._id, revision: 0 }).save();
    res.status(201).json(note.toJSON());
  });
  app.route('/api/notes/:id').put(updateNote).patch(updateNote);
  async function updateNote(req, res) {
    const id = objectId(req.params.id);
    const input = noteInput(req.body, true);
    const version = revision(req.body);
    const note = await NoteModel.findOneAndUpdate({ _id: id, ownerId: req.user._id, revision: version },
      { $set: input, $inc: { revision: 1 } }, { new: true, runValidators: true });
    if (!note) return missingOrConflict(req, res, id);
    res.json(note.toJSON());
  }
  app.delete('/api/notes/:id', async (req, res) => {
    const id = objectId(req.params.id);
    const note = await NoteModel.findOneAndDelete({ _id: id, ownerId: req.user._id, revision: revision(req.body) });
    if (!note) return missingOrConflict(req, res, id);
    res.json({ success: true });
  });
  function revision(body) {
    if (!Number.isSafeInteger(body?.revision) || body.revision < 0 || body.revision >= Number.MAX_SAFE_INTEGER) throw new InputError('revision phải là số nguyên hợp lệ');
    return body.revision;
  }
  async function missingOrConflict(req, res, id) {
    const exists = await NoteModel.findOne({ _id: id, ownerId: req.user._id });
    return res.status(exists ? 409 : 404).json(exists
      ? { error: 'Ghi chú đã thay đổi ở phiên khác. Hãy giữ bản nháp và tải bản mới trước khi lưu lại.', code: 'NOTE_CONFLICT' }
      : { error: 'Không tìm thấy ghi chú', code: 'NOTE_NOT_FOUND' });
  }
  app.get('/api/godot/export', async (req, res) => {
    const notes = (await NoteModel.find({ ownerId: req.user._id }).sort({ createdAt: -1 })).map(note => note.toJSON());
    // Prototype only: X01 replaces this with an authenticated XP ledger.
    const totalXp = notes.length * 50;
    res.json({ level: Math.floor(totalXp / 100) + 1, totalXp, notesCount: notes.length,
      categories: [...new Set(notes.map(note => note.category))],
      source: 'NOTEBUILDER MongoDB Backend', exportedAt: new Date().toISOString(), notes });
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'API không tồn tại', code: 'NOT_FOUND' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error instanceof InputError || error.type === 'entity.parse.failed' ? 400
      : error.type === 'entity.too.large' ? 413 : 500;
    if (status === 500) logger.error('API request failed', { method: req.method, path: req.path, name: error.name });
    res.status(status).json({ error: status === 500 ? 'Lỗi server khi xử lý yêu cầu'
      : status === 413 ? 'Dữ liệu quá lớn' : error instanceof InputError ? error.message : 'JSON không hợp lệ',
      code: status === 500 ? 'INTERNAL_ERROR' : status === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_INPUT' });
  });
  return app;
}
module.exports = { createApp };
