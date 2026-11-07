(() => {
  const ids = ['reviewStatus', 'loginLink', 'refreshReview', 'retryReview', 'sessionPanel', 'cardProgress', 'sessionProgress',
    'cardQuestion', 'revealAnswer', 'cardAnswer', 'ratingDraft', 'rateAgain', 'rateRemembered', 'closeReview', 'reviewSummary',
    'summaryTitle', 'summaryText', 'reviewSetup', 'reviewEmpty', 'reviewNotes', 'noteChoices', 'selectionCount', 'startReview', 'reviewHistory', 'historyList'];
  const ui = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  const selected = new Set(), controllers = new Set();
  let session = null, notes = [], recent = [], owner = null, busy = false, pending = null, revealed = false, expired = false, disposed = false;
  const messages = {
    REVIEW_NOTE_EMPTY: 'Thêm Tóm tắt ý chính cho ghi chú đã chọn trước khi ôn tập.',
    REVIEW_NOTE_NOT_FOUND: 'Một số ghi chú đã thay đổi hoặc bị xóa. Tải lại danh sách để chọn lại.',
    REVIEW_ACTIVE: 'Bạn đã có một phiên ở nơi khác. Tải lại để tiếp tục phiên đó.',
    REVIEW_CONFLICT: 'Phiên đã đổi ở tab khác. Đã tải lại tiến độ; lựa chọn cũ chưa được ghi lại.',
    IDEMPOTENCY_CONFLICT: 'Yêu cầu cũ không khớp lựa chọn này. Hãy tải lại trạng thái trước khi tiếp tục.',
    REVIEW_DATA_INVALID: 'Chưa thể đọc phiên an toàn. Hãy thử lại sau.'
  };
  function validSession(value) {
    return value && typeof value.id === 'string' && /^[a-f0-9]{24}$/i.test(value.id) && ['active', 'completed', 'closed'].includes(value.status) &&
      Number.isSafeInteger(value.revision) && value.revision >= 0 && Array.isArray(value.cards) && value.cards.length >= 1 && value.cards.length <= 20 &&
      Number.isSafeInteger(value.nextIndex) && value.nextIndex >= 0 && value.nextIndex <= value.cards.length &&
      (value.status !== 'active' || value.nextIndex < value.cards.length) &&
      value.cards.every(card => typeof card.question === 'string' && typeof card.answer === 'string' && [null, 'again', 'remembered'].includes(card.rating));
  }
  async function api(path, options = {}) {
    const controller = new AbortController(); controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), 20000);
    try { return await window.KnowledgeAuth.request(path, { ...options, signal: controller.signal }); }
    finally { clearTimeout(timer); controllers.delete(controller); }
  }
  function expire() {
    expired = true; session = null; notes = []; recent = []; pending = null; selected.clear(); revealed = false;
    ui.noteChoices.replaceChildren(); ui.historyList.replaceChildren(); ui.cardQuestion.textContent = ''; ui.cardAnswer.textContent = '';
    ui.summaryText.textContent = ''; ui.ratingDraft.textContent = ''; ui.ratingDraft.hidden = true; ui.reviewHistory.hidden = true;
    ui.reviewStatus.textContent = 'Phiên đăng nhập đã đổi hoặc hết hạn. Hãy đăng nhập và tải lại trang.';
    render();
  }
  async function checkOwner() {
    const data = await api('/api/auth/me');
    if (!data?.user?.id || (owner !== null && owner !== data.user.id)) throw Object.assign(new Error('Session changed'), { status: 401 });
    owner = data.user.id;
  }
  function updateSelection() {
    ui.selectionCount.textContent = `Đã chọn ${selected.size}/20`;
    ui.startReview.disabled = busy || expired || !!pending || !selected.size || selected.size > 20;
  }
  function renderChoices() {
    ui.noteChoices.replaceChildren();
    for (const note of notes) {
      const label = document.createElement('label'); label.className = 'note-choice';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = note.id; checkbox.checked = selected.has(note.id);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked && selected.size >= 20) { checkbox.checked = false; ui.reviewStatus.textContent = 'Mỗi phiên tối đa 20 thẻ.'; return; }
        if (checkbox.checked) selected.add(note.id); else selected.delete(note.id);
        updateSelection();
      });
      const text = document.createElement('span'); text.textContent = `${note.title}${note.category ? ' · ' + note.category : ''}`;
      label.append(checkbox, text); ui.noteChoices.append(label);
    }
    ui.reviewEmpty.hidden = notes.length > 0; ui.reviewNotes.hidden = notes.length === 0;
    updateSelection();
  }
  function renderHistory() {
    ui.historyList.replaceChildren();
    for (const row of recent) {
      const item = document.createElement('li');
      item.textContent = `${row.status === 'completed' ? 'Hoàn thành' : 'Kết thúc sớm'} · ${row.reviewed}/${row.total} thẻ · tự đánh giá đã nhớ ${row.remembered} thẻ`;
      ui.historyList.append(item);
    }
    ui.reviewHistory.hidden = expired || recent.length === 0;
  }
  function render() {
    const active = session?.status === 'active';
    const locked = busy || expired || !!pending;
    ui.loginLink.hidden = !expired;
    ui.refreshReview.disabled = locked;
    ui.retryReview.hidden = !pending || expired; ui.retryReview.disabled = busy;
    ui.sessionPanel.hidden = !active || expired;
    ui.reviewSetup.hidden = active || expired || !owner;
    ui.reviewSummary.hidden = !session || active || expired;
    if (active) {
      const card = session.cards[session.nextIndex];
      ui.cardProgress.textContent = `Thẻ ${session.nextIndex + 1}/${session.cards.length} · đã đánh giá ${session.nextIndex} thẻ`;
      ui.sessionProgress.max = session.cards.length; ui.sessionProgress.value = session.nextIndex;
      ui.cardQuestion.textContent = card.question; ui.cardAnswer.textContent = revealed ? card.answer : ''; ui.cardAnswer.hidden = !revealed;
    } else if (session) {
      const remembered = session.cards.filter(card => card.rating === 'remembered').length;
      ui.summaryText.textContent = `${session.status === 'completed' ? 'Đã hoàn thành phiên' : 'Đã kết thúc sớm'}: ${session.nextIndex}/${session.cards.length} thẻ đã đánh giá; ${remembered} thẻ tự đánh giá đã nhớ.`;
    }
    ui.revealAnswer.disabled = locked; ui.revealAnswer.hidden = false;
    ui.revealAnswer.textContent = revealed ? 'Ẩn tóm tắt' : 'Xem tóm tắt'; ui.revealAnswer.setAttribute('aria-expanded', String(revealed));
    ui.rateAgain.disabled = locked || !revealed; ui.rateRemembered.disabled = locked || !revealed; ui.closeReview.disabled = locked;
    for (const checkbox of ui.noteChoices.querySelectorAll('input')) checkbox.disabled = locked;
    updateSelection();
  }
  async function load() {
    if (busy || pending || expired || disposed) return;
    busy = true; render(); ui.reviewStatus.textContent = 'Đang tải ghi chú và tiến độ ôn tập…';
    try {
      await checkOwner();
      if (disposed) return;
      const [choices, data] = await Promise.all([api('/api/reviews/notes'), api('/api/reviews')]);
      if (disposed) return;
      if (!Array.isArray(choices.notes) || !Array.isArray(data.recent) || (data.active && !validSession(data.active))) throw new Error('Invalid response');
      notes = choices.notes; recent = data.recent; session = data.active;
      for (const id of selected) if (!notes.some(note => note.id === id)) selected.delete(id);
      revealed = false; renderChoices(); renderHistory();
      ui.reviewStatus.textContent = session ? 'Đã khôi phục phiên. Hãy nhớ lại bài học trước khi xem tóm tắt.' : 'Chọn ghi chú để bắt đầu một phiên ôn tập.';
    } catch (error) {
      if (disposed) return;
      if (error.status === 401 || error.code === 'CSRF_INVALID') expire();
      else ui.reviewStatus.textContent = 'Chưa tải được dữ liệu. Hãy thử Tải lại trạng thái.';
    } finally { busy = false; if (!disposed) render(); }
  }
  async function send() {
    if (!pending || busy || expired || disposed) return;
    const request = pending;
    busy = true; render(); ui.reviewStatus.textContent = 'Đang lưu lựa chọn…';
    try {
      await checkOwner();
      if (disposed) return;
      const result = await api(request.path, { method: 'POST', headers: { 'Idempotency-Key': request.key }, body: request.body });
      if (disposed) return;
      if (!validSession(result.session)) throw new Error('Invalid response');
      session = result.session; pending = null; revealed = false;
      if (request.kind === 'start') { selected.clear(); renderChoices(); }
      ui.ratingDraft.hidden = true;
      ui.reviewStatus.textContent = session.status === 'active' ? 'Đã lưu tiến độ ôn tập.' : 'Đã lưu tổng kết phiên. Ghi chú và XP của bạn không đổi.';
      if (session.status !== 'active') {
        const row = { id: session.id, status: session.status, total: session.cards.length, reviewed: session.nextIndex,
          remembered: session.cards.filter(card => card.rating === 'remembered').length };
        recent = [row, ...recent.filter(item => item.id !== row.id)].slice(0, 10); renderHistory();
      }
      render(); (session.status === 'active' ? ui.cardQuestion : ui.summaryTitle).focus();
    } catch (error) {
      if (disposed) return;
      if (error.status === 401 || error.code === 'CSRF_INVALID') { expire(); return; }
      if (!Number.isInteger(error.status) || error.status >= 500) {
        // The write may have committed. Keep this exact request until confirmed.
        ui.reviewStatus.textContent = 'Chưa rõ yêu cầu đã được lưu chưa. Giữ nguyên lựa chọn; bấm Thử lại yêu cầu cũ để xác nhận.';
      } else {
        pending = null;
        ui.reviewStatus.textContent = messages[error.code] || 'Chưa lưu được lựa chọn. Hãy kiểm tra trạng thái rồi thử lại.';
        if (error.code === 'REVIEW_CONFLICT') {
          try {
            const data = await api(request.path.replace(/\/(answers|close)$/, ''));
            if (disposed) return;
            if (!validSession(data.session)) throw new Error('Invalid response');
            session = data.session; revealed = false;
          } catch (reloadError) {
            if (disposed) return;
            if (reloadError.status === 401 || reloadError.code === 'CSRF_INVALID') expire();
            else { session = null; ui.reviewStatus.textContent = 'Chưa tải được tiến độ mới. Hãy Tải lại trạng thái trước khi tiếp tục.'; }
          }
        }
      }
    } finally { busy = false; if (!disposed) render(); }
  }
  function write(kind, body) {
    if (busy || expired || pending || disposed) return;
    pending = { kind, key: crypto.randomUUID(), body: JSON.stringify(body), path: kind === 'start' ? '/api/reviews' : `/api/reviews/${session.id}/${kind === 'answer' ? 'answers' : 'close'}` };
    return send();
  }
  ui.reviewSetup.addEventListener('submit', event => { event.preventDefault(); if (selected.size >= 1 && selected.size <= 20) return write('start', { noteIds: [...selected] }); });
  ui.revealAnswer.addEventListener('click', () => { if (!busy && !pending && !expired) { revealed = !revealed; render(); } });
  function rate(rating) {
    if (!session || session.status !== 'active' || !revealed || busy || pending || expired) return;
    ui.ratingDraft.textContent = `Lựa chọn chưa xác nhận: thẻ ${session.nextIndex + 1} — ${rating === 'remembered' ? 'Đã nhớ' : 'Cần ôn lại'}.`;
    ui.ratingDraft.hidden = false;
    return write('answer', { cardIndex: session.nextIndex, rating, revision: session.revision });
  }
  ui.rateAgain.addEventListener('click', () => rate('again'));
  ui.rateRemembered.addEventListener('click', () => rate('remembered'));
  ui.closeReview.addEventListener('click', () => { if (session?.status === 'active') return write('close', { revision: session.revision }); });
  ui.retryReview.addEventListener('click', send);
  ui.refreshReview.addEventListener('click', load);
  window.addEventListener('pagehide', () => { disposed = true; for (const controller of controllers) controller.abort(); });
  window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
  load();
})();
