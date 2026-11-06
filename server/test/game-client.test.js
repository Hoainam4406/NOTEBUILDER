const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../notegame-web/js/game.js'), 'utf8');
const { prepareRuntime } = require('../scripts/build-game');
function client(fetchImpl = async () => ({ ok: true, json: async () => ({ version: 1, preview: true }) }), mode = 'preview', me = async () => ({})) {
  const events = {}, elements = {}, timers = new Set(), frames = [];
  const element = () => ({ hidden: false, disabled: true, textContent: '', listeners: {}, contentWindow: {},
    addEventListener(name, fn) { this.listeners[name] = fn; }, removeAttribute() {}, remove() { this.removed = true; }, focus() {} });
  const bridgeCalls = [], disposed = [];
  const context = vm.createContext({ document: {
    body: { dataset: { mode } },
    getElementById(id) { return elements[id] ||= element(); },
    createElement(name) { assert.equal(name, 'iframe'); const frame = element(); frames.push(frame); return frame; }
  }, window: { KnowledgeAuth: { me }, KnowledgeCityBridge: { create({ frame }) { bridgeCalls.push(frame); return { dispose() { disposed.push(frame); } }; } }, addEventListener(name, fn) { events[name] = fn; } },
  location: { protocol: 'http:', origin: 'http://127.0.0.1:5050' },
  fetch: fetchImpl, AbortController, setTimeout(fn) { timers.add(fn); return fn; }, clearTimeout(fn) { timers.delete(fn); }, confirm: () => true });
  vm.runInContext(source, context);
  elements.gameStage.appendChild = () => {};
  return { elements, frames, timers, bridgeCalls, disposed, events, async start() { await elements.playButton.listeners.click(); },
    send(data, origin = context.location.origin, target = frames.at(-1)?.contentWindow) { events.message({ data, origin, source: target }); } };
}
test('preview loader verifies frame/origin/schema before accepting ready or progress', async () => {
  const c = client(); await c.start();
  const ready = { channel: 'knowledge-city-preview', version: 1, type: 'ready' };
  c.send(ready, 'https://foreign.example'); c.send(ready, undefined, {}); c.send({ ...ready, version: 2 });
  assert.equal(c.elements.gameCover.hidden, false); assert.equal(c.elements.fullscreenButton.disabled, true);
  c.send(ready);
  assert.equal(c.elements.gameCover.hidden, true); assert.equal(c.elements.fullscreenButton.disabled, false);
  assert.equal(c.timers.size, 0);
});

test('authenticated host requires session and rejects preview or dirty artifacts before creating a frame', async () => {
  for (const build of [{ version: 1, preview: true }, { version: 1, preview: false, bridgeVersion: 1, sourceDirty: true }]) {
    const c = client(async () => ({ ok: true, json: async () => build }), 'city');
    await c.start(); assert.equal(c.frames.length, 0); assert.equal(c.bridgeCalls.length, 0);
  }
  const c = client(undefined, 'city', async () => { throw Object.assign(new Error('private diagnostic'), { status: 401 }); });
  await c.start(); assert.equal(c.frames.length, 0); assert.match(c.elements.coverMessage.textContent, /đăng nhập/);
  assert.doesNotMatch(c.elements.coverMessage.textContent, /diagnostic/);
});

test('authenticated host attaches bridge, separates lifecycle channel and disposes before restart/pagehide', async () => {
  const c = client(async () => ({ ok: true, json: async () => ({ version: 1, preview: false, bridgeVersion: 1, sourceDirty: false }) }), 'city');
  await c.start(); assert.equal(c.frames[0].src, 'game-city-build/index.html'); assert.equal(c.bridgeCalls.length, 1);
  c.send({ channel: 'knowledge-city-preview', version: 1, type: 'ready' }); assert.equal(c.elements.gameCover.hidden, false);
  c.send({ channel: 'knowledge-city-runtime', version: 1, type: 'ready' }); assert.equal(c.elements.gameCover.hidden, true);
  await c.start(); assert.equal(c.disposed.length, 1); assert.equal(c.frames[0].removed, true);
  c.events.pagehide(); assert.equal(c.disposed.length, 2); assert.equal(c.frames[1].removed, true);
});

test('pagehide invalidates a pending load and late ready after failure cannot reopen a dead frame', async () => {
  let finish;
  const delayed = new Promise(resolve => { finish = resolve; });
  const c = client(async () => { await delayed; return { ok: true, json: async () => ({ version: 1, preview: true }) }; });
  const loading = c.start(); c.events.pagehide(); finish(); await loading;
  assert.equal(c.frames.length, 0);
  await c.start(); const old = c.frames[0];
  c.send({ channel: 'knowledge-city-preview', version: 1, type: 'error' });
  c.send({ channel: 'knowledge-city-preview', version: 1, type: 'ready' }, undefined, old.contentWindow);
  assert.equal(c.elements.gameCover.hidden, false); assert.equal(old.removed, true);
});

test('authenticated staging changes only isolated main scene/debug entitlement', () => {
  const native = '[application]\nrun/main_scene="res://World/World.tscn"\n[debug]\nplacement/unlock_all_assets=true\n';
  const staged = prepareRuntime(native, 'city');
  assert.match(staged, /run\/main_scene="res:\/\/Scenes\/City\/server_city.tscn"/);
  assert.match(staged, /placement\/unlock_all_assets=false/); assert.match(native, /World\/World.tscn/);
});

test('a rejected obsolete manifest load cannot destroy a newer frame and bootstrap has a timeout', async () => {
  let rejectFirst, calls = 0;
  const c = client(async () => {
    if (++calls === 1) return new Promise((_resolve, reject) => { rejectFirst = reject; });
    return { ok: true, json: async () => ({ version: 1, preview: true }) };
  });
  const first = c.start(); await Promise.resolve();
  assert.equal(c.timers.size, 1);
  c.events.pagehide(); await c.start();
  rejectFirst(new Error('old load failed')); await first;
  assert.equal(c.frames.length, 1); assert.notEqual(c.frames[0].removed, true);
  c.send({ channel: 'knowledge-city-preview', version: 1, type: 'ready' });
  assert.equal(c.elements.gameCover.hidden, true);
});
test('missing build/network failure keeps retry UI and never creates a fake ready game', async () => {
  for (const fetchImpl of [async () => ({ ok: false }), async () => { throw new Error('Network failed'); }]) {
    const c = client(fetchImpl); await c.start();
    assert.equal(c.frames.length, 0); assert.equal(c.elements.gameCover.hidden, false);
    assert.equal(c.elements.playButton.disabled, false); assert.match(c.elements.gameStatus.textContent, /chưa thành công/);
  }
});
test('late events from an obsolete iframe cannot fail or confirm its replacement', async () => {
  const c = client(); await c.start(); const old = c.frames[0];
  c.send({ channel: 'knowledge-city-preview', version: 1, type: 'error' });
  await c.start();
  old.listeners.error();
  assert.equal(c.elements.playButton.disabled, true);
  c.send({ channel: 'knowledge-city-preview', version: 1, type: 'ready' }, undefined, old.contentWindow);
  assert.equal(c.elements.gameCover.hidden, false);
  c.send({ channel: 'knowledge-city-preview', version: 1, type: 'ready' });
  assert.equal(c.elements.gameCover.hidden, true);
});
test('timeout reports failure and progress clamps numeric values without accepting NaN', async () => {
  const c = client(); await c.start();
  c.send({ channel: 'knowledge-city-preview', version: 1, type: 'loading', percent: 300 });
  assert.equal(c.elements.gameProgress.value, 100);
  c.send({ channel: 'knowledge-city-preview', version: 1, type: 'loading', percent: NaN });
  assert.equal(c.elements.gameProgress.value, 100);
  [...c.timers][0]();
  assert.equal(c.elements.playButton.disabled, false); assert.equal(c.elements.gameCover.hidden, false);
});
test('runtime staging preserves knowledge/physics and excludes editor autoload/plugins without changing native input', () => {
  const native = '[autoload]\r\nKnowledgeManager="*res://manager.gd"\r\n_mcp_game_helper="*res://addons/helper.gd"\r\n[display]\r\nwindow/size/mode=4\r\n[editor_plugins]\r\nenabled=PackedStringArray("res://addons/plugin.cfg")\r\n[physics]\r\n3d/physics_engine="Jolt Physics"\r\n';
  const staged = prepareRuntime(native);
  assert.match(staged, /KnowledgeManager/); assert.match(staged, /Jolt Physics/);
  assert.doesNotMatch(staged, /addons|editor_plugins|_mcp_game_helper/);
  assert.match(staged, /window\/size\/mode=0/); assert.match(native, /window\/size\/mode=4/);
});
