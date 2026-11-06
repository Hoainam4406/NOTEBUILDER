const statusLabel = document.getElementById('accountStatus');
function showUser(user) {
  document.getElementById('signedOut').hidden = Boolean(user);
  document.getElementById('signedIn').hidden = !user;
  document.getElementById('welcome').textContent = user ? `Xin chào, ${user.displayName}` : '';
  document.getElementById('profileForm').elements.displayName.value = user?.displayName || '';
}
async function busy(element, action) {
  const buttons = element.matches('button') ? [element] : element.querySelectorAll('button');
  buttons.forEach(button => { button.disabled = true; });
  statusLabel.textContent = 'Đang xử lý…';
  try { await action(); } catch (error) { statusLabel.textContent = error.message; }
  finally { buttons.forEach(button => { button.disabled = false; }); }
}
for (const action of ['login', 'register', 'profile']) {
  const form = document.getElementById(`${action}Form`);
  form.addEventListener('submit', event => {
    event.preventDefault();
    busy(form, async () => {
      const body = Object.fromEntries(new FormData(form));
      const data = await KnowledgeAuth.request(action === 'profile' ? '/api/profile' : `/api/auth/${action}`,
        { method: action === 'profile' ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      if (action === 'register') {
        form.reset();
        statusLabel.textContent = 'Đã tạo tài khoản. Hãy đăng nhập để mở ghi chú.';
      } else {
        if (action === 'login') form.reset();
        showUser(data.user);
        statusLabel.textContent = action === 'login' ? 'Đăng nhập thành công.' : 'Đã lưu hồ sơ.';
      }
    });
  });
}
document.getElementById('logoutButton').addEventListener('click', event => busy(event.target, async () => {
  await KnowledgeAuth.logout();
  showUser(null);
  statusLabel.textContent = 'Đã đăng xuất.';
}));
KnowledgeAuth.me().then(data => showUser(data.user)).catch(error => {
  if (error.status !== 401) statusLabel.textContent = 'Chưa kết nối được tài khoản. Hãy thử tải lại trang.';
});
