/* Authenticated transport only; preview does not attach this bridge. */
window.KnowledgeCityBridge = (() => {
  const channel = 'knowledge-city';
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const exact = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
  const id = value => typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value);
  const snapshotValid = value => object(value) && object(value.city) && value.city.layoutVersion === 1 &&
    Number.isSafeInteger(value.city.revision) && value.city.revision >= 0 && Array.isArray(value.city.buildings) && Array.isArray(value.inventory);
  const rejectionCodes = new Set(['INVALID_INPUT', 'BUILDING_LOCKED', 'BUILDING_NOT_FOUND', 'CITY_CONFLICT', 'CITY_COLLISION',
    'INVENTORY_EMPTY', 'CITY_FULL', 'IDEMPOTENCY_CONFLICT', 'CATALOG_ITEM_NOT_FOUND', 'OUT_OF_BOUNDS', 'BLOCKED_TILE']);
  function valid(data) {
    if (!object(data) || data.channel !== channel || data.version !== 1 || !Number.isSafeInteger(data.requestId) || data.requestId < 1) return false;
    if (['initialize', 'refresh', 'retry'].includes(data.type)) return exact(data, ['channel', 'version', 'requestId', 'type']);
    if (!exact(data, ['channel', 'version', 'requestId', 'type', 'payload'])) return false;
    const p = data.payload;
    if (data.type === 'remove') return exact(p, ['buildingId']) && id(p.buildingId);
    if (!['place', 'move'].includes(data.type) || !exact(p, [data.type === 'place' ? 'catalogId' : 'buildingId', 'x', 'y'])) return false;
    return Number.isSafeInteger(p.x) && Number.isSafeInteger(p.y) &&
      (data.type === 'place' ? typeof p.catalogId === 'string' && p.catalogId.length > 0 && p.catalogId.length <= 100 : id(p.buildingId));
  }
  function create({ frame }) {
    const target = frame.contentWindow;
    let disposed = false, expired = false, busy = false, lastId = 0, state = null, pending = null, owner = null;
    const controllers = new Set();
    async function timed(run) {
      const controller = new AbortController();
      controllers.add(controller);
      const timer = setTimeout(() => controller.abort(), 20000);
      try { return await run(controller.signal); }
      finally { clearTimeout(timer); controllers.delete(controller); }
    }
    const api = (path, options = {}) => timed(signal => window.KnowledgeAuth.request(path, { ...options, signal }));
    function reply(requestId, result) {
      if (!disposed && frame.contentWindow === target) target.postMessage({ channel, version: 1, requestId, type: 'result', ...result }, location.origin);
    }
    function failure(code, retryable = false, draft) {
      return { ok: false, code, error: 'Chưa thể đồng bộ thành phố. Hãy kiểm tra trạng thái rồi thử lại.', retryable,
        ...(draft ? { draft } : {}), ...(state ? { state } : {}) };
    }
    async function checkSession() {
      const session = await timed(signal => window.KnowledgeAuth.me({ signal }));
      if (typeof session?.user?.id !== 'string' || !session.user.id || (owner !== null && owner !== session.user.id)) {
        const error = new Error('Session changed'); error.status = 401; throw error;
      }
      owner = session.user.id;
    }
    async function load() {
      await checkSession();
      if (disposed) return;
      const [catalog, progress, rewards] = await Promise.all([
        api('/api/city/catalog'), api('/api/progress'), api('/api/rewards')
      ]);
      const snapshot = await api('/api/city');
      if (!snapshotValid(snapshot) || catalog.version !== 1 || !object(catalog.grid) || !Array.isArray(catalog.items) || !Array.isArray(rewards.unlocks)) throw new Error('Invalid snapshot');
      if (!disposed) state = { catalog, progress, unlocks: rewards.unlocks, city: snapshot.city, inventory: snapshot.inventory };
    }
    function expire(error) {
      if (error.status !== 401 && error.code !== 'CSRF_INVALID') return false;
      expired = true; state = null; pending = null;
      return true;
    }
    async function mutate() {
      const request = pending;
      try {
        // Do not replay an uncertain write under a newly logged-in account.
        await checkSession();
        if (disposed) return null;
        const result = await api(request.path, {
          method: request.method, headers: { 'Idempotency-Key': request.key }, body: request.body
        });
        if (disposed) return null;
        if (!snapshotValid(result) || !id(result.buildingId) || typeof result.replayed !== 'boolean') throw new Error('Invalid mutation response');
        state = { ...state, city: result.city, inventory: result.inventory }; pending = null;
        return { ok: true, state, buildingId: result.buildingId, replayed: result.replayed };
      } catch (error) {
        if (disposed) return null;
        if (expire(error)) return failure('AUTH_REQUIRED', false, request.draft);
        // Without a definitive 4xx the server may already have committed.
        if (!Number.isInteger(error.status) || error.status >= 500) return failure('CITY_RETRY_REQUIRED', true, request.draft);
        pending = null;
        if (error.code === 'CITY_CONFLICT') {
          const previous = state; state = null;
          try {
            const snapshot = await api('/api/city');
            if (!snapshotValid(snapshot)) throw new Error('Invalid snapshot');
            if (!disposed) state = { ...previous, city: snapshot.city, inventory: snapshot.inventory };
          } catch (reloadError) { expire(reloadError); }
        }
        return failure(expired ? 'AUTH_REQUIRED' : rejectionCodes.has(error.code) ? error.code : 'CITY_REQUEST_REJECTED', false, request.draft);
      }
    }
    async function receive(event) {
      if (disposed || event.source !== target || frame.contentWindow !== target || event.origin !== location.origin || !valid(event.data)) return;
      const { requestId, type, payload } = event.data;
      if (requestId <= lastId) return;
      lastId = requestId;
      if (expired) return reply(requestId, failure('AUTH_REQUIRED'));
      if (busy) return reply(requestId, failure('BRIDGE_BUSY'));
      busy = true;
      try {
        if (pending && type !== 'retry') return reply(requestId, failure('CITY_RETRY_REQUIRED', true, pending.draft));
        if (type === 'initialize' || type === 'refresh') {
          state = null;
          await load(); reply(requestId, { ok: true, state });
        } else if (type === 'retry') {
          reply(requestId, pending ? await mutate() : failure('NO_PENDING_REQUEST'));
        } else {
          if (!state) return reply(requestId, failure('CITY_NOT_LOADED'));
          if (type !== 'remove' && (payload.x < 0 || payload.y < 0 || payload.x >= state.catalog.grid.width || payload.y >= state.catalog.grid.height)) return reply(requestId, failure('INVALID_INPUT'));
          if (type === 'place' && !state.catalog.items.some(item => item.id === payload.catalogId)) return reply(requestId, failure('INVALID_INPUT'));
          const body = { revision: state.city.revision };
          if (type !== 'remove') Object.assign(body, { x: payload.x, y: payload.y, rotation: 0 });
          if (type === 'place') body.catalogId = payload.catalogId;
          pending = { path: '/api/city/buildings' + (type === 'place' ? '' : '/' + payload.buildingId),
            method: { place: 'POST', move: 'PATCH', remove: 'DELETE' }[type], key: crypto.randomUUID(), body: JSON.stringify(body),
            draft: { operation: type, payload: { ...payload } } };
          reply(requestId, await mutate());
        }
      } catch (error) {
        expire(error); reply(requestId, failure(expired ? 'AUTH_REQUIRED' : 'CITY_LOAD_FAILED'));
      } finally { busy = false; }
    }
    window.addEventListener('message', receive);
    return { dispose() {
      disposed = true; pending = null; state = null; owner = null;
      for (const controller of controllers) controller.abort();
      window.removeEventListener('message', receive);
    } };
  }
  return { create };
})();
