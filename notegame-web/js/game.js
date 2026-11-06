(() => {
  const authenticated = document.body?.dataset.mode === 'city';
  const artifact = authenticated ? 'game-city-build' : 'game-build';
  let bridge = null;
  const stage = document.getElementById('gameStage');
  const cover = document.getElementById('gameCover');
  const status = document.getElementById('gameStatus');
  const title = document.getElementById('coverTitle');
  const message = document.getElementById('coverMessage');
  const play = document.getElementById('playButton');
  const progress = document.getElementById('gameProgress');
  const fullscreen = document.getElementById('fullscreenButton');
  const exitFullscreen = document.getElementById('exitFullscreenButton');
  const restart = document.getElementById('restartButton');
  let frame = null, loading = false, timer = null, generation = 0, loadingController = null;
  function fail(text) {
    generation++;
    loadingController?.abort(); loadingController = null;
    bridge?.dispose(); bridge = null;
    frame?.remove(); frame = null;
    clearTimeout(timer);
    loading = false;
    cover.hidden = false;
    title.textContent = 'Thành phố chưa mở được';
    message.textContent = text;
    status.textContent = 'Tải game chưa thành công';
    play.disabled = false; play.textContent = 'Thử lại'; progress.hidden = true;
    fullscreen.disabled = true; restart.disabled = true;
  }
  async function start() {
    if (loading) return;
    const attempt = ++generation;
    loading = true; cover.hidden = false; play.disabled = true;
    fullscreen.disabled = true; restart.disabled = true;
    title.textContent = 'Đang mở thành phố…'; message.textContent = 'Lần tải đầu tiên có thể mất một chút thời gian.';
    status.textContent = 'Đang tải game'; progress.hidden = false; progress.removeAttribute('value');
    bridge?.dispose(); bridge = null;
    frame?.remove(); frame = null;
    loadingController = new AbortController();
    const signal = loadingController.signal;
    timer = setTimeout(() => fail('Game chưa phản hồi. Hãy thử tải lại hoặc dùng trình duyệt hỗ trợ WebGL 2.'), 120000);
    try {
      if (!location.protocol.startsWith('http')) throw new Error('Hãy mở trang qua máy chủ website để tải game.');
      if (authenticated) await window.KnowledgeAuth.me({ signal });
      if (attempt !== generation) return;
      const response = await fetch(`${artifact}/build.json`, { cache: 'no-store', signal });
      if (!response.ok) throw new Error('Bản game chưa sẵn sàng trên máy chủ này. Vui lòng thử lại sau.');
      const build = await response.json();
      if (attempt !== generation) return;
      if (build.version !== 1 || build.preview !== !authenticated || (authenticated && (build.bridgeVersion !== 1 || build.sourceDirty !== false))) throw new Error('Bản game chưa sẵn sàng. Vui lòng thử lại sau.');
      frame = document.createElement('iframe');
      frame.title = 'Knowledge City — game xây thành phố';
      frame.allow = 'fullscreen; autoplay';
      frame.src = `${artifact}/index.html`;
      const requestedFrame = frame;
      frame.addEventListener('error', () => { if (frame === requestedFrame) fail('Không tải được game. Hãy thử lại.'); });
      stage.appendChild(frame);
      if (authenticated) bridge = window.KnowledgeCityBridge.create({ frame });
    } catch (error) {
      if (attempt !== generation) return;
      fail(error.status === 401 ? 'Hãy mở Tài khoản để đăng nhập, rồi quay lại mở thành phố.' : error.message || 'Không thể tải game. Hãy thử lại.');
    }
  }
  window.addEventListener('message', event => {
    if (!frame || event.source !== frame.contentWindow || event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.channel !== (authenticated ? 'knowledge-city-runtime' : 'knowledge-city-preview') || data.version !== 1) return;
    if (data.type === 'ready') {
      clearTimeout(timer); loadingController = null; loading = false; cover.hidden = true;
      status.textContent = authenticated ? 'Thành phố tài khoản · trạng thái lưu hiển thị trong game' : 'Đang chơi thử · bố cục chưa lưu';
      fullscreen.disabled = false; restart.disabled = false;
      frame.focus();
    } else if (data.type === 'loading' && typeof data.percent === 'number' && Number.isFinite(data.percent)) {
      progress.value = Math.max(0, Math.min(100, data.percent));
    } else if (data.type === 'error' || data.type === 'exit') {
      fail('Game đã dừng. Hãy bấm thử lại để mở một bản chơi thử mới.');
    }
  });
  play.addEventListener('click', start);
  restart.addEventListener('click', () => {
    if (confirm(authenticated ? 'Tải lại trạng thái từ máy chủ? Bản nháp chưa gửi sẽ mất; yêu cầu đã gửi có thể đã được lưu.' : 'Chơi lại sẽ đặt lại bố cục thử hiện tại. Tiếp tục?')) start();
  });
  window.addEventListener('pagehide', () => fail('Game đã tạm dừng. Bấm thử lại để tải trạng thái mới nhất.'));
  fullscreen.addEventListener('click', async () => {
    try { await stage.requestFullscreen(); frame?.focus(); }
    catch { status.textContent = 'Không mở được toàn màn hình; bạn vẫn có thể chơi trong khung bên dưới.'; }
  });
  exitFullscreen.addEventListener('click', async () => {
    try { await document.exitFullscreen(); frame?.focus(); }
    catch { status.textContent = 'Hãy dùng phím Esc để thoát toàn màn hình.'; }
  });
})();
