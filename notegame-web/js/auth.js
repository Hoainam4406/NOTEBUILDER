/* Same-origin cookie sessions. Tokens stay in memory, never localStorage. */
window.KnowledgeAuth = (() => {
  let csrfToken = null;
  async function request(path, options = {}) {
    const headers = { ...options.headers };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
    const response = await fetch(path, { ...options, headers, credentials: 'same-origin' });
    const data = response.status === 204 ? null : await response.json();
    if (!response.ok) {
      const error = new Error(data?.error || 'Không thể xử lý yêu cầu');
      error.status = response.status;
      error.code = data?.code;
      throw error;
    }
    if (data?.csrfToken) csrfToken = data.csrfToken;
    return data;
  }
  return {
    request,
    me: () => request('/api/auth/me'),
    logout: async () => { await request('/api/auth/logout', { method: 'POST' }); csrfToken = null; },
    async fetch(path, options = {}) {
      const headers = { ...options.headers };
      if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
      return fetch(path, { ...options, headers, credentials: 'same-origin' });
    }
  };
})();
