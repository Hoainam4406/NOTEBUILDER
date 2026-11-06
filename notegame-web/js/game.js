(() => {
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
  let frame = null, loading = false, timer = null;
  function fail(text) {
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
    loading = true; cover.hidden = false; play.disabled = true;
    fullscreen.disabled = true; restart.disabled = true;
    title.textContent = 'Đang mở thành phố…'; message.textContent = 'Lần tải đầu tiên có thể mất một chút thời gian.';
    status.textContent = 'Đang tải game'; progress.hidden = false; progress.removeAttribute('value');
    frame?.remove(); frame = null;
    try {
      if (!location.protocol.startsWith('http')) throw new Error('Hãy mở trang qua máy chủ website để tải game.');
      const response = await fetch('game-build/build.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Bản game chưa sẵn sàng trên máy chủ này. Vui lòng thử lại sau.');
      const build = await response.json();
      if (build.version !== 1 || build.preview !== true) throw new Error('Bản game chưa sẵn sàng. Vui lòng thử lại sau.');
      frame = document.createElement('iframe');
      frame.title = 'Knowledge City — game xây thành phố';
      frame.allow = 'fullscreen; autoplay';
      frame.src = 'game-build/index.html';
      const requestedFrame = frame;
      frame.addEventListener('error', () => { if (frame === requestedFrame) fail('Không tải được game. Hãy thử lại.'); });
      stage.appendChild(frame);
      timer = setTimeout(() => fail('Game chưa phản hồi. Hãy thử tải lại hoặc dùng trình duyệt hỗ trợ WebGL 2.'), 120000);
    } catch (error) { fail(error.message || 'Không thể tải game. Hãy thử lại.'); }
  }
  window.addEventListener('message', event => {
    if (!frame || event.source !== frame.contentWindow || event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.channel !== 'knowledge-city-preview' || data.version !== 1) return;
    if (data.type === 'ready') {
      clearTimeout(timer); loading = false; cover.hidden = true;
      status.textContent = 'Đang chơi thử · bố cục chưa lưu';
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
    if (confirm('Chơi lại sẽ đặt lại bố cục thử hiện tại. Tiếp tục?')) start();
  });
  fullscreen.addEventListener('click', async () => {
    try { await stage.requestFullscreen(); frame?.focus(); }
    catch { status.textContent = 'Không mở được toàn màn hình; bạn vẫn có thể chơi trong khung bên dưới.'; }
  });
  exitFullscreen.addEventListener('click', async () => {
    try { await document.exitFullscreen(); frame?.focus(); }
    catch { status.textContent = 'Hãy dùng phím Esc để thoát toàn màn hình.'; }
  });
})();
