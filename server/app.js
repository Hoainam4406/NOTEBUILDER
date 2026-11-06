const express = require('express');
const cors = require('cors');
const path = require('node:path');
const mongoose = require('mongoose');
const Note = require('./models/Note');
const { InputError, noteInput, objectId, noteQuery } = require('./validation');

function createApp({ NoteModel = Note, dbReady = () => mongoose.connection.readyState === 1, logger = console } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: '25mb' }));
  app.use(express.static(path.join(__dirname, '..', 'notegame-web')));
  app.get('/api/health', async (req, res) => {
    const connected = dbReady();
    const count = connected ? await NoteModel.countDocuments() : undefined;
    res.status(connected ? 200 : 503).json({ status: connected ? 'online' : 'unavailable',
      database: connected ? 'MongoDB Connected' : 'Disconnected', totalNotes: count, timestamp: new Date().toISOString() });
  });
  app.use('/api', (req, res, next) => {
    if (!dbReady()) return res.status(503).json({ error: 'Cơ sở dữ liệu chưa sẵn sàng', code: 'DATABASE_UNAVAILABLE' });
    next();
  });
  app.get('/api/notes', async (req, res) => {
    const notes = await NoteModel.find(noteQuery(req.query)).sort({ createdAt: -1 });
    res.json(notes.map(note => note.toJSON()));
  });
  app.post('/api/notes/migrate', async (req, res) => {
    const notes = req.body?.notes;
    if (!Array.isArray(notes) || notes.length < 1 || notes.length > 100) throw new InputError('Batch phải có 1..100 note');
    const validated = notes.map(note => noteInput(note));
    for (const data of validated) await new NoteModel(data).save();
    res.json({ success: true, migratedCount: validated.length });
  });
  app.get('/api/notes/:id', async (req, res) => {
    const note = await NoteModel.findById(objectId(req.params.id));
    if (!note) return res.status(404).json({ error: 'Không tìm thấy ghi chú', code: 'NOTE_NOT_FOUND' });
    res.json(note.toJSON());
  });
  app.post('/api/notes', async (req, res) => {
    const note = await new NoteModel(noteInput(req.body)).save();
    res.status(201).json(note.toJSON());
  });
  app.route('/api/notes/:id').put(updateNote).patch(updateNote);
  async function updateNote(req, res) {
    const id = objectId(req.params.id);
    const input = noteInput(req.body, true);
    const note = await NoteModel.findById(id);
    if (!note) return res.status(404).json({ error: 'Không tìm thấy ghi chú', code: 'NOTE_NOT_FOUND' });
    Object.assign(note, input);
    res.json((await note.save()).toJSON());
  }
  app.delete('/api/notes/:id', async (req, res) => {
    const note = await NoteModel.findByIdAndDelete(objectId(req.params.id));
    if (!note) return res.status(404).json({ error: 'Không tìm thấy ghi chú', code: 'NOTE_NOT_FOUND' });
    res.json({ success: true });
  });
  app.get('/api/godot/export', async (req, res) => {
    const notes = (await NoteModel.find().sort({ createdAt: -1 })).map(note => note.toJSON());
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
