(() => {
  const ui = Object.fromEntries(['journeyStatus', 'journeyLogin', 'refreshJourney', 'retryJourney', 'journeyContent', 'journeyDay', 'questList', 'achievementList'].map(id => [id, document.getElementById(id)]));
  const controllers = new Set();
  let snapshot = null, owner = null, busy = false, pending = null, expired = false, disposed = false;
  const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  function validSnapshot(data) {
    return data && /^\d{4}-\d{2}-\d{2}$/.test(data.day) && validDate(data.resetsAt) &&
      ['achievements', 'quests'].every(kind => Array.isArray(data[kind]) && data[kind].length <= 10 && data[kind].every(row =>
        /^[a-z_]{1,40}$/.test(row.id) && typeof row.title === 'string' && typeof row.description === 'string' &&
        Number.isSafeInteger(row.target) && row.target > 0 && Number.isSafeInteger(row.progress) && row.progress >= 0 && row.progress <= row.target &&
        typeof row.eligible === 'boolean' && (row.claimedAt === null || validDate(row.claimedAt)) && ['notes.html', 'review.html', 'city.html'].includes(row.href)));
  }
  async function api(path, options = {}) {
    const controller = new AbortController(); controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), 20000);
    try { return await window.KnowledgeAuth.request(path, { ...options, signal: controller.signal }); }
    finally { clearTimeout(timer); controllers.delete(controller); }
  }
  async function checkOwner() {
    const data = await api('/api/auth/me');
    if (!data?.user?.id || (owner !== null && owner !== data.user.id)) throw Object.assign(new Error('Session changed'), { status: 401 });
    owner = data.user.id;
  }
  function expire() {
    expired = true; snapshot = null; pending = null;
    ui.journeyDay.textContent = ''; ui.questList.replaceChildren(); ui.achievementList.replaceChildren();
    ui.journeyStatus.textContent = 'Phiên đăng nhập đã đổi hoặc hết hạn. Hãy đăng nhập và tải lại trang.';
    render();
  }
  function renderEntries(kind, rows, container) {
    container.replaceChildren();
    for (const row of rows) {
      const card = document.createElement('article'); card.className = `journey-card${row.claimedAt ? ' is-claimed' : ''}`;
      const heading = document.createElement('h3'); heading.textContent = row.title;
      const description = document.createElement('p'); description.textContent = row.description;
      const progress = document.createElement('progress'); progress.max = row.target; progress.value = row.progress; progress.setAttribute('aria-label', `Tiến độ ${row.title}`);
      const state = document.createElement('p'); state.className = 'claim-state';
      state.textContent = row.claimedAt ? `Đã nhận · ${new Date(row.claimedAt).toISOString().slice(0, 10)} UTC` : `${row.progress}/${row.target} · ${row.eligible ? 'Đã đạt mục tiêu' : 'Đang tích lũy'}`;
      const button = document.createElement('button'); button.type = 'button';
      button.textContent = row.claimedAt ? 'Đã nhận' : kind === 'achievement' ? 'Nhận huy hiệu' : 'Ghi nhận hoàn thành';
      button.setAttribute('aria-label', `${button.textContent}: ${row.title}`);
      button.disabled = busy || expired || !!pending || !row.eligible || !!row.claimedAt;
      button.addEventListener('click', () => claim(kind, row));
      const link = document.createElement('a'); link.href = row.href;
      link.textContent = row.href === 'notes.html' ? 'Đến ghi chú →' : row.href === 'review.html' ? 'Đến ôn tập →' : 'Đến thành phố →';
      card.append(heading, description, progress, state, button, link); container.append(card);
    }
  }
  function render() {
    ui.journeyLogin.hidden = !expired; ui.journeyContent.hidden = !snapshot || expired;
    ui.refreshJourney.disabled = busy || expired || !!pending;
    ui.retryJourney.hidden = !pending || expired; ui.retryJourney.disabled = busy;
    if (snapshot && !expired) {
      ui.journeyDay.textContent = `Ngày ${snapshot.day} UTC · nhiệm vụ mới lúc ${new Date(snapshot.resetsAt).toISOString().replace('T', ' ').replace('.000Z', ' UTC')}`;
      renderEntries('quest', snapshot.quests, ui.questList); renderEntries('achievement', snapshot.achievements, ui.achievementList);
    }
  }
  async function readSnapshot() {
    const data = await api('/api/journey');
    if (disposed) return;
    if (!validSnapshot(data)) throw new Error('Invalid response');
    snapshot = data;
  }
  async function load() {
    if (busy || pending || expired || disposed) return;
    busy = true; render(); ui.journeyStatus.textContent = 'Đang tải tiến độ…';
    try {
      await checkOwner(); if (disposed) return;
      await readSnapshot(); if (disposed) return;
      ui.journeyStatus.textContent = 'Tiến độ đã tải từ máy chủ. Chọn một mục tiêu nhỏ để tiếp tục.';
    } catch (error) {
      if (disposed) return;
      if (error.status === 401 || error.code === 'CSRF_INVALID') expire();
      else ui.journeyStatus.textContent = 'Chưa tải được tiến độ mới. Hãy thử Tải lại tiến độ.';
    } finally { busy = false; if (!disposed) render(); }
  }
  async function send() {
    if (!pending || busy || expired || disposed) return;
    const request = pending;
    busy = true; render(); ui.journeyStatus.textContent = 'Đang ghi nhận mục tiêu…';
    try {
      await checkOwner(); if (disposed) return;
      const result = await api(request.path, { method: 'PUT', body: request.body });
      if (disposed) return;
      if (!result?.claim || result.claim.id !== request.id || result.claim.kind !== request.kind || result.claim.period !== request.period || !validDate(result.claim.claimedAt)) throw new Error('Invalid response');
      const row = snapshot[request.kind === 'quest' ? 'quests' : 'achievements'].find(item => item.id === request.id);
      row.claimedAt = result.claim.claimedAt; pending = null;
      ui.journeyStatus.textContent = `Đã nhận: ${row.title}. XP và kho công trình không đổi.`;
      try { await checkOwner(); if (!disposed) await readSnapshot(); }
      catch (refreshError) {
        if (disposed) return;
        if (refreshError.status === 401 || refreshError.code === 'CSRF_INVALID') { expire(); return; }
        ui.journeyStatus.textContent = `Đã nhận: ${row.title}. Chưa tải được tiến độ mới; bạn có thể Tải lại tiến độ.`;
      }
    } catch (error) {
      if (disposed) return;
      if (error.status === 401 || error.code === 'CSRF_INVALID') { expire(); return; }
      if (!Number.isInteger(error.status) || error.status >= 500) {
        ui.journeyStatus.textContent = 'Chưa rõ xác nhận đã lưu chưa. Giữ nguyên yêu cầu; bấm Thử lại xác nhận cũ.';
      } else {
        pending = null;
        ui.journeyStatus.textContent = error.code === 'QUEST_DAY_CHANGED' ? 'Ngày UTC đã đổi. Đang tải nhiệm vụ mới; không tự nhận thay bạn.' : 'Chưa nhận được mục tiêu. Đang tải lại tiến độ; không tự gửi lại.';
        try { await checkOwner(); if (!disposed) await readSnapshot(); }
        catch (refreshError) {
          if (disposed) return;
          if (refreshError.status === 401 || refreshError.code === 'CSRF_INVALID') expire();
          else { snapshot = null; ui.questList.replaceChildren(); ui.achievementList.replaceChildren(); ui.journeyStatus.textContent = 'Chưa tải được tiến độ. Hãy Tải lại tiến độ trước khi tiếp tục.'; }
        }
      }
    } finally {
      busy = false;
      if (!disposed) { render(); (pending ? ui.retryJourney : ui.journeyStatus).focus(); }
    }
  }
  function claim(kind, row) {
    if (!snapshot || busy || pending || expired || disposed || !row.eligible || row.claimedAt) return;
    pending = { kind, id: row.id, period: kind === 'quest' ? snapshot.day : 'lifetime',
      path: `/api/journey/${kind === 'quest' ? 'quests' : 'achievements'}/${row.id}`, body: JSON.stringify(kind === 'quest' ? { day: snapshot.day } : {}) };
    return send();
  }
  ui.refreshJourney.addEventListener('click', load); ui.retryJourney.addEventListener('click', send);
  window.addEventListener('pagehide', () => { disposed = true; for (const controller of controllers) controller.abort(); });
  window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  load();
})();
