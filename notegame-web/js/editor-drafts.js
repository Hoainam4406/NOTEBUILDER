/* Server-only account drafts. Never publishes a note from an autosave timer. */
window.EditorDrafts = { create({ ownerId, getState, onRestore, onPublished, onList, status, onExpire }) {
  let active = null, pending = null, saved = null, request = null, timer = null, running = null, locked = false, expired = false, disposed = false, restoreSerial = 0, touched = false;
  const controllers = new Set();
  const clone = value => JSON.parse(JSON.stringify(value));
  function state() { const value = getState(); return value ? { ...value, pending } : null; }
  function dirty() { const value = state(); return !!active && (!!request || (saved === null ? touched || !!pending : value && JSON.stringify(value) !== saved)); }
  async function api(path, options = {}) {
    if (expired || disposed) throw new Error('Draft session unavailable');
    const controller = new AbortController(); controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 20000);
    try { return await window.KnowledgeAuth.request(path, { ...options, signal: controller.signal }); }
    catch (error) {
      if (error.status === 401 || error.code === 'CSRF_INVALID') {
        expired = true; active = null; pending = null; saved = null; request = null; clearTimeout(timer); onExpire();
      }
      throw error;
    } finally { clearTimeout(timeout); controllers.delete(controller); }
  }
  async function owner() {
    const data = await api('/api/auth/me');
    if (data?.user?.id !== ownerId) {
      expired = true; active = null; pending = null; request = null; saved = null; clearTimeout(timer); onExpire();
      throw new Error('Account changed');
    }
  }
  async function list() {
    try { await owner(); const data = await api('/api/drafts'); if (!disposed && !expired) onList(data.drafts); }
    catch { if (!expired && !disposed) status('Chưa tải được danh sách nháp. Hãy thử tải lại.'); }
  }
  function attach(record = null) {
    clearTimeout(timer); active = record ? { id: record.id, revision: record.revision } : { id: crypto.randomUUID(), revision: 0 };
    pending = record?.data.pending || null; saved = record ? JSON.stringify(record.data) : null; request = null; locked = false;
    touched = false;
    status(record ? 'Đã khôi phục nháp. Chưa xuất bản thay đổi vào ghi chú.' : 'Nháp sẽ tự lưu trên server khi bạn nhập hoặc vẽ.');
  }
  function changed() {
    if (!active || expired || disposed || locked) return;
    touched = true;
    clearTimeout(timer); status('Có thay đổi chưa được xác nhận lưu nháp…');
    timer = setTimeout(() => { if (!request) flush().catch(() => {}); }, 1000);
  }
  async function flush() {
    if (running) { await running; return flush(); }
    if (!active || expired || disposed) throw new Error('Draft locked');
    if (locked) { await owner(); throw new Error('Draft conflict'); }
    clearTimeout(timer);
    running = (async () => {
      try {
        await owner();
        if (disposed || expired) throw new Error('Inactive');
        for (;;) {
          const data = state(); if (!data) throw new Error('Canvas is loading');
          if (!request && JSON.stringify(data) === saved) break;
          if (!request) request = { path: `/api/drafts/${active.id}`, body: JSON.stringify({ revision: active.revision, data: clone(data) }) };
          const result = await api(request.path, { method: 'PUT', body: request.body });
          if (disposed || expired) return;
          const sent = JSON.parse(request.body);
          if (!result?.draft || result.draft.id !== active.id || result.draft.revision !== sent.revision + 1 || JSON.stringify(result.draft.data) !== JSON.stringify(sent.data)) throw new Error('Invalid draft response');
          active.revision = result.draft.revision; saved = JSON.stringify(result.draft.data); request = null;
          // Changes typed while the old snapshot was saving get a separate CAS write.
        }
        status('Nháp đã lưu trên server. Chưa xuất bản vào ghi chú/XP.');
      } catch (error) {
        if (!disposed && !expired) {
          if (error.code === 'DRAFT_CONFLICT') { locked = true; status('Xung đột nháp giữa hai tab. Nội dung vẫn ở đây để sao chép; không ghi đè bản server.'); }
          else {
            if (error.status >= 400 && error.status < 500) request = null;
            status(error.code === 'DRAFT_TOO_LARGE' ? 'Nháp quá lớn. Chưa tự lưu; giữ editor và giảm canvas.' : 'Chưa xác nhận lưu nháp. Giữ trang mở và bấm Thử lưu nháp lại.');
          }
        }
        throw error;
      }
    })();
    try { await running; } finally { running = null; }
  }
  async function restore(id) {
    const serial = ++restoreSerial;
    try {
      if (dirty()) await flush();
      await owner(); const data = await api(`/api/drafts/${id}`);
      if (!disposed && !expired && serial === restoreSerial) onRestore(data.draft);
    } catch { if (!expired && !disposed) status('Chưa khôi phục được nháp. Giữ editor hiện tại và thử lại.'); }
  }
  async function remove(id, revision) {
    await owner(); await api(`/api/drafts/${id}`, { method: 'DELETE', body: JSON.stringify({ revision }) });
    if (active?.id === id) { active = null; pending = null; request = null; saved = null; }
    await list();
  }
  async function publish(payload) {
    if (!active || expired || disposed) throw new Error('Draft unavailable');
    await owner();
    if (locked) throw new Error('Draft conflict');
    const freshPending = !pending;
    if (freshPending) {
      const value = getState();
      pending = { method: value.noteId ? 'PUT' : 'POST', noteId: value.noteId, revision: value.baseRevision,
        key: value.noteId ? null : crypto.randomUUID(), payload: clone(payload) };
    }
    try { await flush(); } // Persist the frozen publish request BEFORE writing a note.
    catch (error) { if (freshPending && error.status >= 400 && error.status < 500 && error.status !== 409) pending = null; throw error; }
    const original = clone(pending), before = JSON.stringify(getState().fields);
    let note;
    try {
      note = await api(original.method === 'POST' ? '/api/notes' : `/api/notes/${original.noteId}`, {
        method: original.method, headers: original.key ? { 'Idempotency-Key': original.key } : {},
        body: JSON.stringify(original.method === 'POST' ? original.payload : { ...original.payload, revision: original.revision })
      });
    } catch (error) {
      if (error.status !== 409 || original.method !== 'PUT') throw error;
      const current = await api(`/api/notes/${original.noteId}`);
      const matches = current.revision === original.revision + 1 && Object.entries(original.payload).every(([key, value]) => JSON.stringify(current[key]) === JSON.stringify(value));
      if (!matches) { status('Ghi chú đã đổi ở tab khác. Nháp vẫn được giữ; không tự ghi đè.'); throw error; }
      note = current;
    }
    if (disposed || expired) return false;
    if (!note?.id || !Number.isSafeInteger(note.revision)) throw new Error('Invalid note response');
    const changedSinceRequest = JSON.stringify(original.payload) !== JSON.stringify(payload) || JSON.stringify(getState().fields) !== before;
    pending = null; onPublished(note);
    if (changedSinceRequest) {
      try { await flush(); status('Đã xác nhận lần lưu trước. Nội dung mới vẫn ở editor; bấm Lưu để xuất bản.'); }
      catch { if (!expired) status('Ghi chú trước đã lưu. Nháp mới chưa được xác nhận; giữ editor và thử lưu nháp lại.'); }
      return false;
    }
    const previous = active; active = null; request = null; saved = null; clearTimeout(timer);
    let cleaned = true;
    try { await owner(); await api(`/api/drafts/${previous.id}`, { method: 'DELETE', body: JSON.stringify({ revision: previous.revision }) }); }
    catch { cleaned = false; }
    await list();
    if (!expired && !disposed) status(cleaned ? 'Ghi chú đã xuất bản. Bản nháp tương ứng đã dọn.' : 'Ghi chú đã lưu. Chưa dọn được nháp cũ; khôi phục vẫn retry an toàn.');
    return !expired && !disposed;
  }
  function detach() { clearTimeout(timer); active = null; pending = null; request = null; saved = null; }
  window.addEventListener('beforeunload', event => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('pagehide', () => { disposed = true; clearTimeout(timer); for (const controller of controllers) controller.abort(); });
  window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
  return { attach, changed, flush, restore, remove, list, publish, dirty, detach };
} };
