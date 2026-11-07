const mongoose = require('mongoose');
const Note = require('./models/Note');
const ReviewSession = require('./models/ReviewSession');
const { InputError, objectId } = require('./validation');
const { idempotencyKey } = require('./progression');
const { hash } = require('./progression-policy');

class ReviewError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const conflict = () => new ReviewError(409, 'REVIEW_CONFLICT', 'Phiên đã thay đổi ở nơi khác. Hãy tải lại trước khi đánh giá.');
const keyConflict = () => new ReviewError(409, 'IDEMPOTENCY_CONFLICT', 'Request key đã được dùng cho lựa chọn khác');
const missing = () => new ReviewError(404, 'REVIEW_NOT_FOUND', 'Không tìm thấy phiên ôn tập');
const corrupt = () => new ReviewError(503, 'REVIEW_DATA_INVALID', 'Dữ liệu phiên ôn tập chưa thể đọc an toàn');
function exact(body, keys) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== keys.length || !keys.every(key => Object.hasOwn(body, key))) throw new InputError('Dữ liệu ôn tập không hợp lệ');
}
function startInput(body) {
  exact(body, ['noteIds']);
  if (!Array.isArray(body.noteIds) || body.noteIds.length < 1 || body.noteIds.length > 20) throw new InputError('Chọn từ 1 đến 20 ghi chú');
  const ids = body.noteIds.map(value => {
    if (typeof value !== 'string') throw new InputError('ID ghi chú không hợp lệ');
    return objectId(value).toLowerCase();
  });
  if (new Set(ids).size !== ids.length) throw new InputError('Ghi chú không được trùng');
  return { noteIds: ids };
}
function actionInput(operation, body) {
  exact(body, operation === 'answer' ? ['cardIndex', 'rating', 'revision'] : ['revision']);
  if (!Number.isSafeInteger(body.revision) || body.revision < 0 || body.revision >= Number.MAX_SAFE_INTEGER) throw new InputError('revision không hợp lệ');
  if (operation === 'answer' && (!Number.isSafeInteger(body.cardIndex) || body.cardIndex < 0 || body.cardIndex >= 20 || !['again', 'remembered'].includes(body.rating))) throw new InputError('Đánh giá không hợp lệ');
  return operation === 'answer' ? { cardIndex: body.cardIndex, rating: body.rating, revision: body.revision } : { revision: body.revision };
}
function validateStored(row) {
  if (!row || !['active', 'completed', 'closed'].includes(row.status) || !Number.isSafeInteger(row.revision) || row.revision < 0 ||
      !Array.isArray(row.cards) || row.cards.length < 1 || row.cards.length > 20 || !Number.isSafeInteger(row.nextIndex) ||
      row.nextIndex < 0 || row.nextIndex > row.cards.length || !Array.isArray(row.receipts) || row.receipts.length > 21 ||
      (row.status === 'active' && row.nextIndex >= row.cards.length) || (row.status === 'completed' && row.nextIndex !== row.cards.length)) throw corrupt();
  if (row.revision !== row.nextIndex + (row.status === 'closed' ? 1 : 0) || row.receipts.length !== row.revision ||
      row.receipts.some(receipt => !receipt || typeof receipt.key !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(receipt.key) || !/^[a-f0-9]{64}$/.test(receipt.requestHash)) ||
      new Set(row.receipts.map(receipt => receipt.key)).size !== row.receipts.length) throw corrupt();
  for (let index = 0; index < row.cards.length; index++) {
    const card = row.cards[index];
    if (!card.noteId || !Number.isSafeInteger(card.noteRevision) || card.noteRevision < 0 || typeof card.question !== 'string' || typeof card.answer !== 'string' ||
        card.question.length > 200 || card.answer.length > 100000 ||
        (row.status === 'active' && (!card.question.trim() || !card.answer.trim())) ||
        (row.status !== 'active' && (card.question || card.answer)) ||
        (index < row.nextIndex ? !['again', 'remembered'].includes(card.rating) || !card.reviewedAt : card.rating !== null || card.reviewedAt !== null)) throw corrupt();
  }
}
function publicSession(row) {
  validateStored(row);
  return { id: String(row._id), status: row.status, revision: row.revision, nextIndex: row.nextIndex,
    cards: row.cards.map(card => ({ noteId: String(card.noteId), noteRevision: card.noteRevision, question: card.question, answer: card.answer, rating: card.rating, reviewedAt: card.reviewedAt })),
    createdAt: row.createdAt, updatedAt: row.updatedAt };
}
function summary(row) {
  validateStored(row);
  return { id: String(row._id), status: row.status, total: row.cards.length, reviewed: row.nextIndex,
    remembered: row.cards.filter(card => card.rating === 'remembered').length, createdAt: row.createdAt, updatedAt: row.updatedAt };
}
function createReviewService({ connection = mongoose.connection, now = () => new Date() } = {}) {
  async function availableNotes(userId) {
    const rows = await Note.find({ ownerId: userId, content: { $regex: /\S/ } }).select('_id title category revision').sort({ updatedAt: -1, _id: 1 }).limit(100).lean();
    return { notes: rows.map(row => ({ id: String(row._id), title: row.title, category: row.category, revision: row.revision })), limit: 100 };
  }
  async function list(userId) {
    const [active, recent] = await Promise.all([
      ReviewSession.findOne({ userId, status: 'active' }).lean(),
      ReviewSession.find({ userId, status: { $in: ['completed', 'closed'] } }).sort({ updatedAt: -1 }).limit(10).lean()
    ]);
    return { active: active ? publicSession(active) : null, recent: recent.map(summary) };
  }
  async function get(userId, id) {
    const row = await ReviewSession.findOne({ _id: id, userId }).lean();
    if (!row) throw missing();
    return { session: publicSession(row) };
  }
  async function start(userId, input, key) {
    key = idempotencyKey(key);
    const requestHash = hash(JSON.stringify(input));
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await connection.transaction(async session => {
          const existing = await ReviewSession.findOne({ userId, createKey: key }).session(session).lean();
          if (existing) {
            if (existing.createHash !== requestHash) throw keyConflict();
            return { session: publicSession(existing), replayed: true };
          }
          if (await ReviewSession.exists({ userId, status: 'active' }).session(session)) throw new ReviewError(409, 'REVIEW_ACTIVE', 'Bạn đang có một phiên ôn tập. Hãy tiếp tục hoặc kết thúc phiên đó.');
          const notes = await Note.find({ ownerId: userId, _id: { $in: input.noteIds } }).session(session).lean();
          if (notes.length !== input.noteIds.length) throw new ReviewError(404, 'REVIEW_NOTE_NOT_FOUND', 'Không tìm thấy một số ghi chú đã chọn');
          const byId = new Map(notes.map(note => [String(note._id), note]));
          const cards = input.noteIds.map(id => {
            const note = byId.get(id);
            if (typeof note.content !== 'string' || !note.content.trim()) throw new ReviewError(422, 'REVIEW_NOTE_EMPTY', 'Hãy thêm Tóm tắt ý chính trước khi ôn tập ghi chú');
            return { noteId: note._id, noteRevision: note.revision, question: note.title, answer: note.content, rating: null, reviewedAt: null };
          });
          const [created] = await ReviewSession.create([{ userId, createKey: key, createHash: requestHash, cards, status: 'active', revision: 0, nextIndex: 0, receipts: [] }], { session });
          return { session: publicSession(created.toObject()), replayed: false };
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      } catch (error) {
        if (error.code === 11000 && attempt < 4) continue;
        throw error;
      }
    }
  }
  async function mutate(userId, id, operation, input, key) {
    key = idempotencyKey(key);
    const requestHash = hash(JSON.stringify({ operation, ...input }));
    function replay(row) {
      if (row.createKey === key) throw keyConflict();
      const receipt = row.receipts.find(item => item.key === key);
      if (!receipt) return null;
      if (receipt.requestHash !== requestHash) throw keyConflict();
      return { session: publicSession(row), replayed: true };
    }
    const row = await ReviewSession.findOne({ _id: id, userId }).lean();
    if (!row) throw missing();
    validateStored(row);
    const previous = replay(row);
    if (previous) return previous;
    if (row.revision !== input.revision || row.status !== 'active' || (operation === 'answer' && input.cardIndex !== row.nextIndex)) throw conflict();
    const cards = row.cards.map(card => ({ ...card }));
    let nextIndex = row.nextIndex;
    let status = 'closed';
    if (operation === 'answer') {
      cards[nextIndex].rating = input.rating;
      cards[nextIndex].reviewedAt = now();
      nextIndex++;
      status = nextIndex === cards.length ? 'completed' : 'active';
    }
    if (status !== 'active') for (const card of cards) { card.question = ''; card.answer = ''; }
    const updated = await ReviewSession.findOneAndUpdate({ _id: id, userId, revision: input.revision, status: 'active', nextIndex: row.nextIndex },
      { $set: { cards, nextIndex, status }, $inc: { revision: 1 }, $push: { receipts: { key, requestHash } } },
      { returnDocument: 'after', runValidators: true }).lean();
    if (updated) return { session: publicSession(updated), replayed: false };
    const current = await ReviewSession.findOne({ _id: id, userId }).lean();
    if (!current) throw missing();
    validateStored(current);
    const concurrent = replay(current);
    if (concurrent) return concurrent;
    throw conflict();
  }
  return { availableNotes, list, get, start,
    answer: (userId, id, input, key) => mutate(userId, id, 'answer', input, key),
    close: (userId, id, input, key) => mutate(userId, id, 'close', input, key) };
}
module.exports = { createReviewService, ReviewError, startInput, actionInput, publicSession };
