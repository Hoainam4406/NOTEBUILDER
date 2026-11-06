const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../notegame-web/js/game.js'), 'utf8');
const { prepareRuntime } = require('../scripts/build-game');
function client(fetchImpl = async () => ({ ok: true, json: async () => ({ version: 1, preview: true }) })) {
  const events = {}, elements = {}, timers = new Set(), frames = [];
  const element = () => ({ hidden: false, disabled: true, textContent: '', listeners: {}, contentWindow: {},
    addEventListener(name, fn) { this.listeners[name] = fn; }, removeAttribute() {}, remove() { this.removed = true; }, focus() {} });
  const context = vm.createContext({ document: {
    getElementById(id) { return elements[id] ||= element(); },
    createElement(name) { assert.equal(name, 'iframe'); const frame = element(); frames.push(frame); return frame; }
  }, window: { addEventListener(name, fn) { events[name] = fn; } },
  location: { protocol: 'http:', origin: 'http://127.0.0.1:5050' },
  fetch: fetchImpl, setTimeout(fn) { timers.add(fn); return fn; }, clearTimeout(fn) { timers.delete(fn); }, confirm: () => true });
  vm.runInContext(source, context);
  elements.gameStage.appendChild = () => {};
  return { elements, frames, timers, async start() { await elements.playButton.listeners.click(); },
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
