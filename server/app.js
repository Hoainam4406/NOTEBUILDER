const express = require('express');
const path = require('node:path');
const mongoose = require('mongoose');
const Note = require('./models/Note');
const { InputError, noteInput, objectId, noteQuery } = require('./validation');
const { createAuth } = require('./auth');
const { createProgression, ProgressionError, idempotencyKey } = require('./progression');
const { createCityService } = require('./city');
const { CATALOG, CityError, mutationInput, buildingId } = require('./city-rules');
const { createReviewService, ReviewError, startInput, actionInput } = require('./reviews');
const { createJourneyService, JourneyError, claimInput } = require('./journey');

function createApp({ NoteModel = Note, auth = createAuth(), progression = createProgression(), city = createCityService(), reviews = createReviewService(), journey = createJourneyService(), dbReady = () => mongoose.connection.readyState === 1, logger = console } = {}) {
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
  app.use(['/api/notes', '/api/godot', '/api/progress', '/api/rewards', '/api/city', '/api/reviews', '/api/journey'], auth.requireUser, auth.csrf);
  app.get('/api/journey', async (req, res) => res.json(await journey.dashboard(req.user._id)));
  app.put('/api/journey/achievements/:id', async (req, res) => res.json(await journey.claim(req.user._id, 'achievement', req.params.id, claimInput('achievement', req.body))));
  app.put('/api/journey/quests/:id', async (req, res) => res.json(await journey.claim(req.user._id, 'quest', req.params.id, claimInput('quest', req.body))));
  app.get('/api/reviews/notes', async (req, res) => res.json(await reviews.availableNotes(req.user._id)));
  app.get('/api/reviews', async (req, res) => res.json(await reviews.list(req.user._id)));
  app.post('/api/reviews', async (req, res) => {
    const result = await reviews.start(req.user._id, startInput(req.body), req.get('Idempotency-Key'));
    res.status(result.replayed ? 200 : 201).json(result);
  });
  app.get('/api/reviews/:id', async (req, res) => res.json(await reviews.get(req.user._id, objectId(req.params.id))));
  app.post('/api/reviews/:id/answers', async (req, res) => res.json(await reviews.answer(req.user._id, objectId(req.params.id), actionInput('answer', req.body), req.get('Idempotency-Key'))));
  app.post('/api/reviews/:id/close', async (req, res) => res.json(await reviews.close(req.user._id, objectId(req.params.id), actionInput('close', req.body), req.get('Idempotency-Key'))));
  app.get('/api/city/catalog', (req, res) => res.json(CATALOG));
  app.get('/api/city', async (req, res) => res.json(await city.getCity(req.user._id)));
  app.post('/api/city/buildings', async (req, res) => {
    const input = mutationInput('place', req.body);
    const result = await city.place(req.user._id, input, req.get('Idempotency-Key'));
    res.status(result.replayed ? 200 : 201).json(result);
  });
  app.patch('/api/city/buildings/:id', async (req, res) => {
    const input = mutationInput('move', req.body);
    res.json(await city.move(req.user._id, buildingId(req.params.id), input, req.get('Idempotency-Key')));
  });
  app.delete('/api/city/buildings/:id', async (req, res) => {
    const input = mutationInput('remove', req.body);
    res.json(await city.remove(req.user._id, buildingId(req.params.id), input, req.get('Idempotency-Key')));
  });
  app.get('/api/progress', async (req, res) => res.json(await progression.getProgress(req.user._id)));
  app.get('/api/rewards', async (req, res) => res.json(await progression.getRewards(req.user._id)));
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
    const input = noteInput(req.body);
    const key = idempotencyKey(req.get('Idempotency-Key'));
    const { note, replayed } = await progression.createNote(req.user._id, input, key);
    res.status(replayed ? 200 : 201).json(note.toJSON());
  });
  app.route('/api/notes/:id').put(updateNote).patch(updateNote);
  async function updateNote(req, res) {
    const id = objectId(req.params.id);
    const input = noteInput(req.body, true);
    const version = revision(req.body);
    const note = await NoteModel.findOneAndUpdate({ _id: id, ownerId: req.user._id, revision: version },
      { $set: input, $inc: { revision: 1 } }, { returnDocument: 'after', runValidators: true });
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
    const { notes, progress, rewards } = await progression.exportKnowledge(req.user._id);
    res.json({ ...progress, progress, rewards, notesCount: notes.length,
      categories: [...new Set(notes.map(note => note.category))],
      source: 'NOTEBUILDER MongoDB Backend', exportedAt: new Date().toISOString(), notes });
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'API không tồn tại', code: 'NOT_FOUND' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const domainError = error instanceof ProgressionError || error instanceof CityError || error instanceof ReviewError || error instanceof JourneyError;
    const status = domainError ? error.status : error instanceof InputError || error.type === 'entity.parse.failed' ? 400
      : error.type === 'entity.too.large' ? 413 : 500;
    if (status === 500) logger.error('API request failed', { method: req.method, path: req.path, name: error.name });
    res.status(status).json({ error: domainError ? error.message : status === 500 ? 'Lỗi server khi xử lý yêu cầu'
      : status === 413 ? 'Dữ liệu quá lớn' : error instanceof InputError ? error.message : 'JSON không hợp lệ',
      code: domainError ? error.code : status === 500 ? 'INTERNAL_ERROR' : status === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_INPUT' });
  });
  return app;
}
module.exports = { createApp };
