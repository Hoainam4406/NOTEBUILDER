const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const pinnedSource = require('../game-source.json');
const root = path.resolve(__dirname, '../..');
const defaultProject = path.resolve(root, '../isometric-grid-building-game/isometric_building_game');
function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || `${executable} failed:\n${result.stdout}\n${result.stderr}`);
  return (result.stdout || '') + (result.stderr || '');
}
function prepareRuntime(project, mode = 'preview') {
  // Strip editor tooling only in the staging copy. Never mutate the open project.
  const runtime = project.replace(/^_mcp_game_helper=.*\r?\n/gm, '')
    .replace(/\[editor_plugins\][\s\S]*?(?=\r?\n\[|$)/, '')
    .replace(/^window\/size\/mode=.*$/m, 'window/size/mode=0');
  return mode === 'city' ? runtime.replace(/^run\/main_scene=.*$/m, 'run/main_scene="res://Scenes/City/server_city.tscn"')
    .replace(/^placement\/unlock_all_assets=.*$/m, 'placement/unlock_all_assets=false') : runtime;
}
function build(mode = 'preview') {
  if (!['preview', 'city'].includes(mode)) throw new Error('Unknown game build mode');
  const project = path.resolve(process.env.GODOT_PROJECT_PATH || defaultProject);
  const godot = process.env.GODOT_BIN;
  if (!godot) throw new Error('Set GODOT_BIN to the Godot 4.7.2 executable. See docs/WEB_GAME.md.');
  if (!run(godot, ['--version']).trim().startsWith('4.7.2.stable')) throw new Error('Godot 4.7.2.stable is required');
  if (run('git', ['-C', project, 'branch', '--show-current']).trim() !== 'main') throw new Error('Game source must be on main');
  if (run('git', ['-C', project, 'remote', 'get-url', 'origin']).trim() !== pinnedSource.repository) throw new Error('Game source remote does not match the pinned repository');
  const gameCommit = run('git', ['-C', project, 'rev-parse', 'HEAD']).trim();
  if (gameCommit !== pinnedSource.commit) throw new Error(`Game main must match pinned source ${pinnedSource.commit}; update server/game-source.json with a verified checkpoint first`);
  const sourceDirty = Boolean(run('git', ['-C', project, 'status', '--porcelain', '--untracked-files=no']).trim());
  if (sourceDirty) throw new Error('Game source must be committed before release export');
  const cache = path.join(root, 'server/node_modules/.cache/godot-web');
  fs.mkdirSync(cache, { recursive: true });
  const staging = fs.mkdtempSync(path.join(cache, 'build-'));
  for (const entry of ['Assets', 'Scenes', 'World', 'web', 'project.godot', 'export_presets.cfg', 'icon.svg', 'icon.svg.import']) {
    fs.cpSync(path.join(project, entry), path.join(staging, entry), { recursive: true });
  }
  fs.writeFileSync(path.join(staging, 'project.godot'), prepareRuntime(fs.readFileSync(path.join(staging, 'project.godot'), 'utf8'), mode));
  const output = path.join(staging, 'export');
  fs.mkdirSync(output, { recursive: true });
  console.log('Importing isolated game runtime (editor addons excluded)…');
  const imported = run(godot, ['--headless', '--editor', '--path', staging, '--import', '--quit']);
  if (/SCRIPT ERROR:|Parse Error:/.test(imported)) throw new Error(imported);
  const preset = mode === 'city' ? 'Web City' : 'Web Preview';
  console.log(`Exporting single-threaded ${preset}…`);
  const exported = run(godot, ['--headless', '--path', staging, '--export-release', preset, path.join(output, 'index.html')]);
  if (/SCRIPT ERROR:|Parse Error:/.test(exported)) throw new Error(exported);
  const files = ['index.html', 'index.js', 'index.wasm', 'index.pck'].map(name => {
    const data = fs.readFileSync(path.join(output, name));
    if (!data.length) throw new Error(`Empty game artifact: ${name}`);
    return { name, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
  });
  fs.writeFileSync(path.join(output, 'build.json'), JSON.stringify({ version: 1, engine: '4.7.2', gameCommit, sourceDirty, preview: mode === 'preview',
    ...(mode === 'city' ? { bridgeVersion: 1 } : {}), files }, null, 2));
  const published = path.resolve(root, mode === 'city' ? 'notegame-web/game-city-build' : 'notegame-web/game-build');
  const backup = path.join(staging, 'previous-export');
  if (!published.startsWith(root + path.sep) || !backup.startsWith(cache + path.sep)) throw new Error('Invalid artifact paths');
  const previous = fs.existsSync(published);
  if (previous) {
    const manifest = JSON.parse(fs.readFileSync(path.join(published, 'build.json'), 'utf8'));
    if (manifest.version !== 1 || manifest.preview !== (mode === 'preview')) throw new Error('Refusing to replace an unrecognized artifact folder');
    fs.renameSync(published, backup);
  }
  try { fs.renameSync(output, published); }
  catch (error) { if (previous) fs.renameSync(backup, published); throw error; }
  console.log(`Web ${mode} ready: ${published}\n${files.map(file => `${file.name}: ${file.bytes} bytes`).join('\n')}`);
}
if (require.main === module) {
  try { build(process.argv.includes('--city') ? 'city' : 'preview'); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { prepareRuntime };
