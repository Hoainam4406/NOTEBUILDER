const NoteDraft = require('./models/NoteDraft');
const { InputError, objectId, noteInput } = require('./validation');
const { hash } = require('./progression-policy');
const { idempotencyKey } = require('./progression');
class DraftError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const conflict = () => new DraftError(409, 'DRAFT_CONFLICT', 'Nháp đã đổi ở phiên khác. Giữ nội dung hiện tại và khôi phục lại bản đã lưu.');
function draftId(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)) throw new InputError('ID nháp không hợp lệ');
  return value.toLowerCase();
}
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))) throw new InputError('Dữ liệu nháp không hợp lệ');
}
function version(value) { if (!Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER) throw new InputError('revision nháp không hợp lệ'); return value; }
function draftInput(body, remove = false) {
  exact(body, remove ? ['revision'] : ['revision', 'data']); version(body.revision);
  if (remove) return body;
  const d = body.data; exact(d, ['noteId', 'baseRevision', 'fields', 'pending']);
  if (d.noteId === null) { if (d.baseRevision !== null) throw new InputError('Phiên bản gốc không hợp lệ'); }
  else { objectId(d.noteId); version(d.baseRevision); }
  const f = d.fields; exact(f, ['title', 'category', 'content', 'tags', 'template', 'canvasJSON']);
  for (const [key, max] of [['title', 200], ['category', 100], ['content', 100000], ['tags', 2000]]) {
    if (typeof f[key] !== 'string' || f[key].length > max) throw new InputError('Nội dung nháp quá dài hoặc sai kiểu');
  }
  noteInput({ title: f.title.trim() || 'Draft', template: f.template, canvasJSON: f.canvasJSON });
  if (d.pending !== null) {
    const p = d.pending; exact(p, ['method', 'noteId', 'revision', 'key', 'payload']);
    if (p.method === 'POST') {
      if (p.noteId !== null || p.revision !== null) throw new InputError('Request tạo nháp không hợp lệ'); idempotencyKey(p.key);
    } else if (p.method === 'PUT') { objectId(p.noteId); version(p.revision); if (p.key !== null) throw new InputError('Request sửa nháp không hợp lệ'); }
    else throw new InputError('Method nháp không hợp lệ');
    noteInput(p.payload);
  }
  if (Buffer.byteLength(JSON.stringify(d), 'utf8') > 12 * 1024 * 1024) throw new DraftError(413, 'DRAFT_TOO_LARGE', 'Nháp quá lớn để tự lưu an toàn. Giữ editor và giảm dung lượng canvas.');
  return body;
}
function output(row) { return { id: row.draftId, revision: row.revision, data: row.data, updatedAt: row.updatedAt }; }
function createDraftService() {
  async function get(userId, id) {
    const row = await NoteDraft.findOne({ userId, draftId: id }).lean();
    if (!row) throw new DraftError(404, 'DRAFT_NOT_FOUND', 'Không tìm thấy nháp');
    return { draft: output(row) };
  }
  async function save(userId, id, { revision, data }) {
    const lastHash = hash(JSON.stringify(data));
    let row;
    if (revision === 0) {
      try { row = await NoteDraft.create({ userId, draftId: id, revision: 1, lastHash, data }); }
      catch (error) { if (error.code !== 11000) throw error; }
    } else row = await NoteDraft.findOneAndUpdate({ userId, draftId: id, revision }, { $set: { data, lastHash }, $inc: { revision: 1 } }, { returnDocument: 'after', runValidators: true }).lean();
    if (row) return { draft: output(row), replayed: false };
    const current = await NoteDraft.findOne({ userId, draftId: id }).lean();
    if (current?.revision === revision + 1 && current.lastHash === lastHash) return { draft: output(current), replayed: true };
    throw conflict();
  }
  return { get, save,
    async list(userId) {
      const rows = await NoteDraft.find({ userId }).select('draftId revision data.fields.title updatedAt').sort({ updatedAt: -1 }).limit(20).lean();
      return { drafts: rows.map(row => ({ id: row.draftId, revision: row.revision, title: row.data.fields.title, updatedAt: row.updatedAt })) };
    },
    async remove(userId, id, revision) {
      if (!await NoteDraft.findOneAndDelete({ userId, draftId: id, revision })) throw conflict();
    }
  };
}
module.exports = { createDraftService, DraftError, draftInput, draftId };
