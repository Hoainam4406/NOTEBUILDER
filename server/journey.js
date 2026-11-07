const mongoose = require('mongoose');
const XpEvent = require('./models/XpEvent');
const ReviewSession = require('./models/ReviewSession');
const City = require('./models/City');
const JourneyClaim = require('./models/JourneyClaim');
const { InputError } = require('./validation');

class JourneyError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const ACHIEVEMENTS = Object.freeze([
  { id: 'first_note', title: 'Bài học đầu tiên', description: 'Lưu một ghi chú đủ điều kiện nhận XP.', target: 1, metric: 'notes', href: 'notes.html' },
  { id: 'five_notes', title: 'Tủ sách nhỏ', description: 'Có 5 ghi chú đã nhận XP, kể cả ghi chú sau đó được xóa.', target: 5, metric: 'notes', href: 'notes.html' },
  { id: 'three_days', title: 'Từng ngày tích lũy', description: 'Nhận XP từ ghi chú trong 3 ngày UTC khác nhau; không cần liên tiếp.', target: 3, metric: 'days', href: 'notes.html' },
  { id: 'first_review', title: 'Nhớ lại điều đã học', description: 'Hoàn thành trọn vẹn một phiên ôn tập.', target: 1, metric: 'reviews', href: 'review.html' },
  { id: 'first_city', title: 'Viên gạch đầu tiên', description: 'Lưu thay đổi đầu tiên vào thành phố tài khoản.', target: 1, metric: 'city', href: 'city.html' }
].map(Object.freeze));
const QUESTS = Object.freeze([
  { id: 'daily_note', title: 'Một bài học hôm nay', description: 'Lưu 1 note thực sự nhận XP trong ngày UTC này.', target: 1, metric: 'todayNotes', href: 'notes.html' },
  { id: 'daily_review', title: 'Ba lần nhớ lại', description: 'Tự đánh giá 3 thẻ hôm nay, kể cả Cần ôn lại. Không chấm đúng/sai.', target: 3, metric: 'todayCards', href: 'review.html' }
].map(Object.freeze));
function definition(kind, id) {
  const entry = (kind === 'achievement' ? ACHIEVEMENTS : kind === 'quest' ? QUESTS : []).find(item => item.id === id);
  if (!entry) throw new JourneyError(404, 'JOURNEY_NOT_FOUND', 'Không tìm thấy mục tiêu học tập');
  return entry;
}
function claimInput(kind, body) {
  const keys = kind === 'quest' ? ['day'] : [];
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== keys.length || !keys.every(key => Object.hasOwn(body, key))) throw new InputError('Dữ liệu xác nhận không hợp lệ');
  if (kind === 'quest' && (typeof body.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.day) || !Number.isFinite(Date.parse(body.day)) || new Date(body.day).toISOString().slice(0, 10) !== body.day)) throw new InputError('Ngày UTC không hợp lệ');
  return kind === 'quest' ? { day: body.day } : {};
}
function publicClaim(row) { return { id: row.entryId, kind: row.kind, period: row.period, claimedAt: row.claimedAt }; }
function createJourneyService({ connection = mongoose.connection, now = () => new Date(), afterWrite = async () => {} } = {}) {
  async function facts(userId, date, session) {
    const day = date.toISOString().slice(0, 10), start = new Date(`${day}T00:00:00.000Z`), end = new Date(start.getTime() + 86400000);
    const owner = new mongoose.Types.ObjectId(String(userId));
    // Sequential queries: parallel operations inside a MongoDB transaction are unsupported.
    const [awarded] = await XpEvent.aggregate([
      { $match: { userId: owner, amount: { $gt: 0 } } },
      { $group: { _id: '$day', count: { $sum: 1 } } },
      { $group: { _id: null, notes: { $sum: '$count' }, days: { $sum: 1 }, todayNotes: { $sum: { $cond: [{ $eq: ['$_id', day] }, '$count', 0] } } } }
    ]).session(session);
    const reviews = await ReviewSession.countDocuments({ userId: owner, status: 'completed' }).session(session);
    const [cards] = await ReviewSession.aggregate([
      { $match: { userId: owner, 'cards.reviewedAt': { $gte: start, $lt: end } } }, { $unwind: '$cards' },
      { $match: { 'cards.reviewedAt': { $gte: start, $lt: end }, 'cards.rating': { $in: ['again', 'remembered'] } } }, { $count: 'total' }
    ]).session(session);
    const city = await City.exists({ userId: owner, revision: { $gt: 0 } }).session(session);
    return { notes: awarded?.notes || 0, days: awarded?.days || 0, todayNotes: awarded?.todayNotes || 0,
      reviews, todayCards: cards?.total || 0, city: city ? 1 : 0 };
  }
  async function dashboard(userId) {
    const date = now(), day = date.toISOString().slice(0, 10);
    return connection.transaction(async session => {
      const state = await facts(userId, date, session);
      const claims = await JourneyClaim.find({ userId, $or: [{ kind: 'achievement', period: 'lifetime' }, { kind: 'quest', period: day }] }).session(session).lean();
      function entries(kind, definitions) {
        return definitions.map(({ metric, ...entry }) => ({ ...entry, progress: Math.min(entry.target, state[metric]), eligible: state[metric] >= entry.target,
          claimedAt: claims.find(row => row.kind === kind && row.entryId === entry.id)?.claimedAt || null }));
      }
      return { day, resetsAt: new Date(new Date(`${day}T00:00:00.000Z`).getTime() + 86400000),
        achievements: entries('achievement', ACHIEVEMENTS), quests: entries('quest', QUESTS) };
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  }
  async function claim(userId, kind, id, input) {
    const entry = definition(kind, id), date = now(), day = date.toISOString().slice(0, 10);
    if (kind === 'quest' && input.day !== day) throw new JourneyError(409, 'QUEST_DAY_CHANGED', 'Ngày UTC đã đổi. Hãy tải lại nhiệm vụ hôm nay.');
    const filter = { userId, kind, period: kind === 'quest' ? day : 'lifetime', entryId: id };
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await connection.transaction(async session => {
          const existing = await JourneyClaim.findOne(filter).session(session).lean();
          if (existing) return { claim: publicClaim(existing), replayed: true };
          const state = await facts(userId, date, session);
          if (state[entry.metric] < entry.target) throw new JourneyError(409, 'JOURNEY_NOT_READY', 'Bạn chưa đạt mục tiêu này. Hãy tiếp tục học và tải lại tiến độ.');
          const [row] = await JourneyClaim.create([{ ...filter, claimedAt: date }], { session });
          await afterWrite();
          return { claim: publicClaim(row), replayed: false };
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      } catch (error) { if (error.code === 11000 && attempt < 4) continue; throw error; }
    }
  }
  return { dashboard, claim };
}
module.exports = { createJourneyService, JourneyError, claimInput, definition };
