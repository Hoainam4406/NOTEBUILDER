class InputError extends Error {
  constructor(message) { super(message); this.status = 400; this.code = 'INVALID_INPUT'; }
}
function text(value, name, max, required = false) {
  if (typeof value !== 'string') throw new InputError(`${name} phải là chuỗi`);
  const result = value.trim();
  if (result.length > max || (required && !result)) throw new InputError(`${name} phải có ${required ? '1' : '0'}..${max} ký tự`);
  return result;
}
function noteInput(body, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('Note phải là object');
  const result = {};
  if (!partial || Object.hasOwn(body, 'title')) result.title = text(body.title, 'title', 200, true);
  for (const [key, max] of [['category', 100], ['content', 100000], ['createdAt', 100]]) {
    if (Object.hasOwn(body, key)) result[key] = text(body[key], key, max);
  }
  if (Object.hasOwn(body, 'template')) {
    if (!['1', '2', '3', '4'].includes(body.template)) throw new InputError('template không hợp lệ');
    result.template = body.template;
  }
  if (Object.hasOwn(body, 'tags')) {
    if (!Array.isArray(body.tags) || body.tags.length > 20) throw new InputError('tags phải là mảng tối đa 20 phần tử');
    result.tags = [...new Set(body.tags.map(tag => text(tag, 'tag', 50, true)))];
  }
  for (const key of ['canvasImage', 'canvasJSON']) {
    if (Object.hasOwn(body, key)) result[key] = body[key] === null ? null : text(body[key], key, 10000000);
  }
  if (result.canvasJSON) {
    let canvas;
    try { canvas = JSON.parse(result.canvasJSON); } catch { throw new InputError('canvasJSON phải là JSON hợp lệ'); }
    if (!canvas || typeof canvas !== 'object' || Array.isArray(canvas)) throw new InputError('canvasJSON phải chứa object');
  }
  if (Object.hasOwn(result, 'createdAt')) { result.createdAtCustom = result.createdAt; delete result.createdAt; }
  return result;
}
function objectId(id) {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new InputError('ID ghi chú không hợp lệ');
  return id;
}
function noteQuery(query) {
  const result = {};
  if (query.template !== undefined && query.template !== 'all') {
    if (!['1', '2', '3', '4'].includes(query.template)) throw new InputError('template không hợp lệ');
    result.template = query.template;
  }
  if (query.search !== undefined) {
    const search = text(query.search, 'search', 200);
    if (search) {
      const literal = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      result.$or = ['title', 'content', 'category', 'tags'].map(key => ({ [key]: literal }));
    }
  }
  return result;
}
module.exports = { InputError, noteInput, objectId, noteQuery };
