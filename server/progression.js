const mongoose = require('mongoose');
const Note = require('./models/Note');
const Progress = require('./models/Progress');
const XpEvent = require('./models/XpEvent');
const XpFingerprint = require('./models/XpFingerprint');
const Unlock = require('./models/Unlock');
const Inventory = require('./models/Inventory');
const { InputError } = require('./validation');
const { POLICY_VERSION, hash, contentClaim, awardDecision, progressFor, rewardsFor } = require('./progression-policy');

class ProgressionError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
function idempotencyKey(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(value)) throw new InputError('Idempotency-Key phải có 16..128 ký tự chữ, số, _ hoặc -');
  return value;
}
function payloadHash(input) {
  return hash(JSON.stringify(Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)))));
}
function createProgression({ connection = mongoose.connection, now = () => new Date(), afterWrite = async () => {} } = {}) {
  async function createNote(userId, input, key) {
    const owner = new mongoose.Types.ObjectId(String(userId));
    const eventKey = `note:create:${idempotencyKey(key)}`;
    const requestHash = payloadHash(input);
    const createdAt = now();
    const day = createdAt.toISOString().slice(0, 10);
    // Unique-key upsert races are not transient transaction errors. Retry the
    // entire transaction, then replay the event committed by the winning writer.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await connection.transaction(async session => {
          const existing = await XpEvent.findOne({ userId: owner, eventKey }).session(session);
          if (existing) {
            if (existing.payloadHash !== requestHash) throw new ProgressionError(409, 'IDEMPOTENCY_CONFLICT', 'Request key đã được dùng cho nội dung khác');
            const note = await Note.findOne({ _id: existing.noteId, ownerId: owner }).session(session);
            if (!note) throw new ProgressionError(410, 'NOTE_DELETED', 'Ghi chú của request này đã bị xóa');
            return { note, replayed: true };
          }
          const progress = await Progress.findOneAndUpdate({ userId: owner },
            { $inc: { revision: 1 }, $setOnInsert: { totalXp: 0 } },
            { upsert: true, returnDocument: 'after', session });
          const claim = contentClaim(input.content);
          const duplicate = claim.eligible && Boolean(await XpFingerprint.findOne({ userId: owner, fingerprint: claim.fingerprint }).session(session));
          if (claim.eligible && !duplicate) await XpFingerprint.create([{ userId: owner, fingerprint: claim.fingerprint }], { session });
          const [daily] = await XpEvent.aggregate([
            { $match: { userId: owner, day } }, { $group: { _id: null, amount: { $sum: '$amount' } } }
          ]).session(session);
          const decision = awardDecision({ eligible: claim.eligible, duplicate, earnedToday: daily?.amount || 0 });
          const [note] = await Note.create([{ ...input, ownerId: owner, revision: 0 }], { session });
          await XpEvent.create([{ userId: owner, eventKey, payloadHash: requestHash, noteId: note._id,
            policyVersion: POLICY_VERSION, ...decision, fingerprint: claim.eligible ? claim.fingerprint : null, day, createdAt }], { session });
          const totalXp = progress.totalXp + decision.amount;
          const state = progressFor(totalXp);
          await Progress.updateOne({ _id: progress._id }, { $set: { totalXp } }, { session, runValidators: true });
          await afterWrite('ledger');
          for (const reward of rewardsFor(state.level)) {
            if (await Unlock.findOne({ userId: owner, rewardId: reward.id }).session(session)) continue;
            await Unlock.create([{ userId: owner, rewardId: reward.id, catalogId: reward.catalogId, level: reward.level, grantedAt: createdAt }], { session });
            await Inventory.updateOne({ userId: owner, catalogId: reward.catalogId }, { $inc: { quantity: reward.quantity } }, { upsert: true, session });
          }
          await afterWrite('inventory');
          return { note, replayed: false };
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      } catch (error) {
        if (error.code === 11000 && attempt < 4) continue;
        if (error.code === 20 || error.codeName === 'IllegalOperation') {
          throw new ProgressionError(503, 'TRANSACTIONS_REQUIRED', 'MongoDB cần replica set để lưu ghi chú và tiến trình an toàn');
        }
        throw error;
      }
    }
  }
  async function getProgress(userId) {
    const stored = await Progress.findOne({ userId });
    return { ...progressFor(stored?.totalXp || 0), revision: stored?.revision || 0, policyVersion: POLICY_VERSION };
  }
  async function getRewards(userId) {
    const unlocks = await Unlock.find({ userId }).sort({ level: 1 });
    const inventory = await Inventory.find({ userId }).sort({ catalogId: 1 });
    return { policyVersion: POLICY_VERSION,
      unlocks: unlocks.map(row => ({ rewardId: row.rewardId, catalogId: row.catalogId, level: row.level, grantedAt: row.grantedAt })),
      inventory: inventory.map(row => ({ catalogId: row.catalogId, quantity: row.quantity })) };
  }
  return { createNote, getProgress, getRewards };
}
async function ensureProgressionDatabase(connection = mongoose.connection) {
  const hello = await connection.db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') throw new ProgressionError(503, 'TRANSACTIONS_REQUIRED', 'MongoDB phải là replica set hoặc sharded cluster');
  await Promise.all(Object.values(connection.models).map(model => model.init()));
}
module.exports = { createProgression, ensureProgressionDatabase, ProgressionError, idempotencyKey };
