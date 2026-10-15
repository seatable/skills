import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig, validateConfig, parseSetting, browserScript } from '../scripts/dev-config.mjs';
import { isDeployPath, loadManifest, injectConfig, startSinglePreview, startVitePreview } from '../scripts/preview.mjs';

const skill = fileURLToPath(new URL('..', import.meta.url));
const config = { server: 'https://example.invalid/service/path/', appUuid: 'synthetic-app', pageId: 'synthetic-page', accountToken: 'synthetic-test-token' };
const html = '<!doctype html><html><head><title>Test</title></head><body>Test</body></html>';
function project(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'seatable-local-tools-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function run(root, script, ...args) {
  return spawnSync(process.execPath, [path.join(skill, 'scripts', script), '--project', root, ...args], { encoding: 'utf8' });
}
function settingFile(root, mode = 'single') { return path.join(root, mode === 'single' ? 'setting.js' : 'src/setting.js'); }
function saveSetting(root, value = config, mode = 'single') {
  const file = settingFile(root, mode);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `export default ${JSON.stringify(value)};\n`);
}
function setup(root, mode = 'single') {
  const result = run(root, 'setup-local.mjs', '--mode', mode);
  assert.equal(result.status, 0, result.stderr);
}
function request(port, resource, headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: resource, headers, method }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('both modes initialize only private settings and preserve values and ignore rules', t => {
  const template = fs.readFileSync(path.join(skill, 'assets/setting.template.js'), 'utf8');
  for (const mode of ['single', 'vite']) {
    const root = project(t);
    const file = settingFile(root, mode);
    setup(root, mode);
    assert.equal(fs.readFileSync(file, 'utf8'), template);
    assert.deepEqual(parseSetting(template), { server: '', appUuid: '', pageId: '', accountToken: '' });
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.deepEqual(fs.readdirSync(root).sort(), ['.gitignore', mode === 'single' ? 'setting.js' : 'src']);
    if (mode === 'vite') assert.deepEqual(fs.readdirSync(path.join(root, 'src')), ['setting.js']);
    saveSetting(root, config, mode);
    const original = fs.readFileSync(file, 'utf8');
    const ignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
    fs.chmodSync(file, 0o644);
    setup(root, mode);
    assert.deepEqual(loadConfig(root, mode), config);
    assert.equal(fs.readFileSync(file, 'utf8'), original);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal(fs.readFileSync(path.join(root, '.gitignore'), 'utf8'), ignore);
  }
});

test('loading requires four flat fields and retains the complete server path', t => {
  const root = project(t);
  assert.throws(() => loadConfig(root), /Local connection file is missing/);
  saveSetting(root);
  assert.deepEqual(loadConfig(root), config);
  for (const value of [null, [], { profiles: { dev: config } }, { ...config, extra: 'unsupported' }]) {
    assert.throws(() => validateConfig(value), /flat object/);
  }
  for (const key of Object.keys(config)) {
    assert.throws(() => validateConfig({ ...config, [key]: '' }), { message: new RegExp(`^${key}`) });
    assert.throws(() => validateConfig({ ...config, [key]: 'YOUR_VALUE' }), /placeholder/);
  }
  for (const server of ['ftp://example.invalid', 'https://user:password@example.invalid', 'https://example.invalid/?secret=1', 'https://example.invalid/#fragment']) {
    assert.throws(() => validateConfig({ ...config, server }), /server must/);
  }
  saveSetting(root, { ...config, pageId: 'changed-page' });
  assert.equal(loadConfig(root).pageId, 'changed-page');
});

test('single-file configuration is parsed statically and never executed or exposed', t => {
  const root = project(t);
  const file = path.join(root, 'setting.js');
  const marker = path.join(root, 'executed.txt');
  const source = `export default ${JSON.stringify(config)}; await import('node:fs').then(fs => fs.writeFileSync(${JSON.stringify(marker)}, 'executed'));`;
  fs.writeFileSync(file, source);
  setup(root);
  assert.throws(() => loadConfig(root), /static default/);
  const preview = run(root, 'preview.mjs', '--mode', 'single');
  assert.equal(preview.status, 1);
  assert.match(preview.stderr, /static default/);
  assert.equal((preview.stdout + preview.stderr).includes(config.accountToken), false);
  assert.equal(fs.existsSync(marker), false);
  assert.equal(fs.readFileSync(file, 'utf8'), source);
});

test('both modes require Git-ignored and untracked settings', t => {
  for (const mode of ['single', 'vite']) {
    const root = project(t);
    const git = (...args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
    assert.equal(git('init', '-q').status, 0);
    saveSetting(root, config, mode);
    assert.throws(() => loadConfig(root, mode), /Git-ignored and untracked/);
    setup(root, mode);
    assert.deepEqual(loadConfig(root, mode), config);
    assert.equal(git('add', '-f', '--', path.relative(root, settingFile(root, mode))).status, 0);
    assert.throws(() => loadConfig(root, mode), /Git-ignored and untracked/);
    assert.equal(run(root, 'setup-local.mjs', '--mode', mode).status, 1);
  }
});

test('injection escapes script delimiters and rejects missing heads or duplicate contexts', () => {
  const dangerous = { ...config, accountToken: 'synthetic-</script>\u2028\u2029-tail' };
  const script = browserScript(dangerous);
  assert.equal(script.includes('</script>'), false);
  assert.equal(script.includes('\u2028'), false);
  assert.equal(script.includes('\u2029'), false);
  assert.throws(() => injectConfig(html, null), /Local connection configuration/);
  assert.match(injectConfig(html, dangerous), /Object\.freeze/);
  assert.throws(() => injectConfig('<html><body></body></html>', config), /explicit <head>/);
  assert.throws(() => injectConfig('<head><script>window.__HTML_PAGE_DEV_CONFIG__ = {};</script></head>', config), /already contains/);
});

test('absent manifest allows only index.html while existing manifests must be valid', t => {
  const root = project(t);
  fs.writeFileSync(path.join(root, 'index.html'), html);
  fs.writeFileSync(path.join(root, 'other.txt'), 'not an allowed asset');
  assert.deepEqual([...loadManifest(root).keys()], ['index.html']);
  assert.equal(fs.existsSync(path.join(root, 'deploy-files.json')), false);
  const file = path.join(root, 'deploy-files.json');
  const valid = JSON.stringify({ files: ['index.html', 'other.txt'] });
  fs.writeFileSync(file, valid);
  setup(root);
  assert.equal(fs.readFileSync(file, 'utf8'), valid);
  assert.deepEqual([...loadManifest(root).keys()], ['index.html', 'other.txt']);
  for (const source of ['{', 'null', '[]']) {
    fs.writeFileSync(file, source);
    assert.throws(() => loadManifest(root), /valid JSON|JSON object/);
  }
  fs.unlinkSync(file);
  fs.symlinkSync(path.join(root, 'missing.json'), file);
  assert.throws(() => loadManifest(root), /symbolic links/);
});

test('manifest validation rejects invalid lists, missing files and symlinked assets', t => {
  const root = project(t);
  fs.writeFileSync(path.join(root, 'index.html'), html);
  const file = path.join(root, 'deploy-files.json');
  for (const files of [null, [], ['other.txt'], ['index.html', 'index.html'], ['index.html', 'setting.js']]) {
    fs.writeFileSync(file, JSON.stringify({ files }));
    assert.throws(() => loadManifest(root), /must explicitly list/);
  }
  for (const name of ['missing.js', 'assets', 'linked.html']) {
    if (name === 'assets') fs.mkdirSync(path.join(root, name));
    if (name === 'linked.html') fs.symlinkSync(path.join(root, 'index.html'), path.join(root, name));
    fs.writeFileSync(file, JSON.stringify({ files: ['index.html', name] }));
    assert.throws(() => loadManifest(root), /missing or not a regular file|symbolic links/);
  }
});

test('case-variant private paths cannot enter a manifest or start connected preview', async t => {
  const root = project(t);
  fs.writeFileSync(path.join(root, 'index.html'), html);
  saveSetting(root);
  for (const name of ['SETTING.JS', 'Setting.Js', 'assets/Setting.Template.Js', 'SRC/setting.js', 'assets/config.LOCAL.js']) {
    fs.writeFileSync(path.join(root, 'deploy-files.json'), JSON.stringify({ files: ['index.html', name] }));
    assert.throws(() => loadManifest(root), /safe deployment assets/, name);
    let session;
    try {
      await assert.rejects(async () => {
        session = await startSinglePreview({ root, config, port: 0 });
      }, /safe deployment assets/);
    } finally { if (session) await session.close(); }
  }
});

test('single preview works with or without a manifest and never serves private files', async t => {
  for (const withManifest of [false, true]) {
    const root = project(t);
    fs.writeFileSync(path.join(root, 'index.html'), html);
    fs.writeFileSync(path.join(root, 'public.js'), 'console.log(1);');
    if (withManifest) fs.writeFileSync(path.join(root, 'deploy-files.json'), JSON.stringify({ files: ['index.html', 'public.js'] }));
    fs.writeFileSync(path.join(root, 'unlisted.txt'), 'not public');
    saveSetting(root);
    const session = await startSinglePreview({ root, config: loadConfig(root), port: 0 });
    t.after(() => session.close());
    const result = await request(session.port, '/');
    assert.equal(result.status, 200);
    assert.equal((await request(session.port, '/public.js')).status, withManifest ? 200 : 404);
    assert.equal(result.headers['cache-control'], 'no-store');
    assert.match(result.body, /__HTML_PAGE_DEV_CONFIG__/);
    assert.equal(result.body.includes(config.accountToken), true);
    assert.equal(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), html);
    for (const resource of ['/unlisted.txt', '/deploy-files.json', '/setting.js', '/SETTING.JS', '/Setting.Js', '/%53ETTING.JS', '/.seatable/dev-config.local.js', '/src/setting.js', '/%2e%2e/setting.js']) {
      const denied = await request(session.port, resource);
      assert.equal(denied.status, 404);
      assert.equal(denied.body.includes(config.accountToken), false);
    }
    assert.equal((await request(session.port, '/', { Host: 'external.invalid' })).status, 403);
    assert.equal((await request(session.port, '/', { Origin: 'https://external.invalid' })).status, 403);
    assert.equal((await request(session.port, '/', { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await request(session.port, '/', {}, 'POST')).status, 405);
    assert.equal((await request(session.port, '/', {}, 'HEAD')).body, '');
  }
});

test('both preview entry points require complete configuration before starting', async t => {
  for (const startPreview of [startSinglePreview, startVitePreview]) {
    const root = project(t);
    fs.writeFileSync(path.join(root, 'index.html'), html);
    const before = fs.readdirSync(root);
    const previous = process.cwd();
    for (const value of [undefined, null, {}, { ...config, pageId: '' }]) {
      await assert.rejects(startPreview({ root, config: value, port: 0 }), /Local connection configuration|must be a non-empty value/);
      assert.deepEqual(fs.readdirSync(root), before);
      assert.equal(process.cwd(), previous);
    }
  }
});

test('preview CLI stops on missing or invalid settings in both modes', t => {
  for (const mode of ['single', 'vite']) {
    const root = project(t);
    fs.writeFileSync(path.join(root, 'index.html'), html);
    const missing = run(root, 'preview.mjs', '--mode', mode, '--port', '0');
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /Local connection file is missing/);
    assert.equal(missing.stdout, '');
    assert.equal(fs.existsSync(settingFile(root, mode)), false);
    setup(root, mode);
    for (const source of [
      'throw new Error("INVALID SYNTHETIC SECRET");',
      `export default ${JSON.stringify({ ...config, pageId: '' })};`,
    ]) {
      fs.writeFileSync(settingFile(root, mode), source);
      const before = fs.readdirSync(root);
      const invalid = run(root, 'preview.mjs', '--mode', mode, '--port', '0');
      assert.equal(invalid.status, 1);
      assert.equal(invalid.stdout, '');
      assert.equal((invalid.stdout + invalid.stderr).includes('INVALID SYNTHETIC SECRET'), false);
      assert.equal((invalid.stdout + invalid.stderr).includes(config.accountToken), false);
      assert.deepEqual(fs.readdirSync(root), before);
      assert.equal(fs.readFileSync(settingFile(root, mode), 'utf8'), source);
    }
  }
});

test('preview CLI connects using local settings without a connection selector', { timeout: 10000 }, async t => {
  const root = project(t);
  fs.writeFileSync(path.join(root, 'index.html'), html);
  setup(root);
  saveSetting(root);
  const originalSettings = fs.readFileSync(settingFile(root), 'utf8');
  const before = fs.readdirSync(root);
  const child = spawn(process.execPath, [path.join(skill, 'scripts/preview.mjs'), '--project', root,
    '--mode', 'single', '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const closed = new Promise(resolve => child.once('close', resolve));
  t.after(async () => { if (child.exitCode === null) child.kill('SIGTERM'); await closed; });
  const port = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', () => reject(new Error('Preview CLI exited before startup: ' + errors)));
    child.stdout.on('data', chunk => {
      log += chunk;
      const match = /Local SeaTable preview: http:\/\/127\.0\.0\.1:(\d+)\//.exec(log);
      if (match && log.includes('Confirm separately before testing writes to real data.')) resolve(Number(match[1]));
    });
  });
  const response = await request(port, '/');
  assert.equal(response.status, 200);
  assert.match(response.body, /__HTML_PAGE_DEV_CONFIG__/);
  assert.equal(response.body.includes(config.accountToken), true);
  assert.equal((await request(port, '/setting.js')).status, 404);
  assert.equal(log.includes(config.accountToken), false);
  assert.equal(errors, '');
  assert.deepEqual(fs.readdirSync(root), before);
  assert.equal(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), html);
  assert.equal(fs.readFileSync(settingFile(root), 'utf8'), originalSettings);
  child.kill('SIGTERM');
  assert.equal(await closed, 0);
});

test('removed connection selectors are rejected instead of switching preview behavior', t => {
  for (const mode of ['single', 'vite']) {
    const root = project(t);
    for (const value of ['visual', 'live', 'unknown']) {
      const result = run(root, 'preview.mjs', '--mode', mode, '--connection', value, '--port', '0');
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Unknown option/);
      assert.equal(result.stdout, '');
      assert.deepEqual(fs.readdirSync(root), []);
    }
  }
});

test('both modes reject missing or symlinked settings without changing their targets', t => {
  for (const mode of ['single', 'vite']) {
    const root = project(t);
    assert.throws(() => loadConfig(root, mode), /Local connection file is missing/);
    saveSetting(root, { ...config, pageId: '' }, mode);
    assert.throws(() => loadConfig(root, mode), /pageId/);
    const other = project(t);
    saveSetting(other, config, mode);
    const target = settingFile(other, mode);
    const original = fs.readFileSync(target, 'utf8');
    const file = settingFile(root, mode);
    fs.unlinkSync(file);
    fs.symlinkSync(target, file);
    assert.throws(() => loadConfig(root, mode), /symbolic links/);
    assert.equal(run(root, 'setup-local.mjs', '--mode', mode).status, 1);
    assert.equal(fs.readFileSync(target, 'utf8'), original);
  }
});

function viteStub(root, removeDeny = false) {
  const folder = path.join(root, 'node_modules/vite');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
  fs.writeFileSync(path.join(folder, 'package.json'), '{"name":"vite","type":"module","exports":"./index.mjs"}');
  fs.writeFileSync(path.join(folder, 'index.mjs'), `
    export async function createServer(options) {
      const plugin = options.plugins[0];
      const deny = plugin.config({server:{fs:{deny:['preserved-rule']}}}).server.fs.deny;
      const state = {options, plugin, listened:false, closed:false};
      globalThis.__seatableViteTest = state;
      return {
        config:{server:{...options.server, fs:{deny:${removeDeny ? "deny.filter(rule => rule !== '**/setting.js')" : 'deny'}}}},
        httpServer:{address:()=>({port:3005})},
        listen:async()=>{state.listened=true}, close:async()=>{state.closed=true}
      };
    }
  `);
}

test('Vite preview reads direct settings unchanged and safely handles template injection', async t => {
  const root = project(t);
  setup(root, 'vite');
  viteStub(root);
  const previous = process.cwd();
  const dangerous = { ...config, accountToken: 'synthetic-</script>' };
  saveSetting(root, dangerous, 'vite');
  const originalFile = fs.readFileSync(path.join(root, 'src/setting.js'), 'utf8');
  const session = await startVitePreview({ root, config: dangerous, port: 3005 });
  const state = globalThis.__seatableViteTest;
  try {
    assert.equal(state.listened, true);
    assert.equal(state.options.server.host, '127.0.0.1');
    const deny = state.plugin.config({ server: { fs: { deny: ['preserved-rule'] } } }).server.fs.deny;
    for (const rule of ['preserved-rule', '**/setting.js', '**/.seatable/**']) assert.equal(deny.includes(rule), true);
    const original = `<head><script>window.__HTML_PAGE_DEV_CONFIG__ = ${JSON.stringify(dangerous)}</script></head>`;
    const normalized = state.plugin.transformIndexHtml.handler(original);
    assert.equal(normalized.includes('synthetic-</script>'), false);
    assert.match(normalized, /Object\.freeze/);
    assert.match(state.plugin.transformIndexHtml.handler(html), /__HTML_PAGE_DEV_CONFIG__/);
    assert.equal(fs.readFileSync(path.join(root, 'src/setting.js'), 'utf8'), originalFile);
    assert.equal(fs.existsSync(path.join(root, 'setting.js')), false);
    const escaped = `<head><script>${browserScript(dangerous)}</script></head>`;
    assert.equal(state.plugin.transformIndexHtml.handler(escaped), escaped);
  } finally {
    await session.close();
    delete globalThis.__seatableViteTest;
  }
  assert.equal(process.cwd(), previous);
  assert.equal(state.closed, true);
});

test('Vite startup stops if a project overrides settings protection', async t => {
  const root = project(t);
  setup(root, 'vite');
  viteStub(root, true);
  const previous = process.cwd();
  try {
    await assert.rejects(startVitePreview({ root, config, port: 3005 }), /did not preserve/);
    assert.equal(globalThis.__seatableViteTest.listened, false);
    assert.equal(globalThis.__seatableViteTest.closed, true);
    assert.equal(process.cwd(), previous);
  } finally { delete globalThis.__seatableViteTest; }
});

test('CLIs reject unknown options and do not expose values on configuration failure', t => {
  const root = project(t);
  setup(root);
  saveSetting(root, { ...config, pageId: '' });
  const result = run(root, 'preview.mjs', '--mode', 'single');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /pageId/);
  assert.equal((result.stdout + result.stderr).includes(config.accountToken), false);
  for (const script of ['preview.mjs', 'setup-local.mjs', 'prepare-vite.mjs']) {
    const help = run(root, script, '--help');
    assert.equal(help.status, 0);
    assert.ok(help.stdout.includes('--project'));
    const unsupported = run(root, script, '--unsupported-option', 'value');
    assert.equal(unsupported.status, 1);
    assert.match(unsupported.stderr, /Unknown option/);
    assert.equal((unsupported.stdout + unsupported.stderr).includes(config.accountToken), false);
  }
});

test('shared deployment fixtures match the preview allowlist', () => {
  const cases = JSON.parse(fs.readFileSync(new URL('./fixtures/deploy-paths.json', import.meta.url), 'utf8'));
  for (const item of cases) assert.equal(isDeployPath(item.name), item.allowed, String(item.name));
});

test('both modes load the shared static-settings fixtures without executing or changing them', t => {
  const cases = JSON.parse(fs.readFileSync(new URL('./fixtures/static-settings.json', import.meta.url), 'utf8'));
  for (const mode of ['single', 'vite']) {
    const root = project(t);
    setup(root, mode);
    const file = path.join(root, mode === 'single' ? 'setting.js' : 'src/setting.js');
    for (const item of cases) {
      fs.writeFileSync(file, item.source);
      if (item.config) assert.deepEqual(loadConfig(root, mode), item.config, `${mode}: ${item.name}`);
      else assert.throws(() => loadConfig(root, mode), error => !error.message.includes('synthetic-fixture-token'), `${mode}: ${item.name}`);
      assert.equal(fs.readFileSync(file, 'utf8'), item.source);
    }
  }
  assert.equal(globalThis.SYNTHETIC_CONFIG_EXECUTED, undefined);
});

test('both modes reject the opposite connection input before setup changes any files', t => {
  for (const mode of ['single', 'vite']) {
    for (const both of [false, true]) {
      const root = project(t);
      if (mode === 'single' || both) saveSetting(root, config, 'vite');
      if (mode === 'vite' || both) saveSetting(root);
      const ignore = '# user-owned ignore rules\n';
      fs.writeFileSync(path.join(root, '.gitignore'), ignore);
      const before = [path.join(root, 'setting.js'), path.join(root, 'src/setting.js')]
        .filter(file => fs.existsSync(file)).map(file => [file, fs.readFileSync(file, 'utf8')]);
      const result = run(root, 'setup-local.mjs', '--mode', mode);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Keep only/);
      assert.equal(result.stderr.includes(config.accountToken), false);
      assert.throws(() => loadConfig(root, mode), /Keep only/);
      assert.equal(fs.readFileSync(path.join(root, '.gitignore'), 'utf8'), ignore);
      for (const [file, source] of before) assert.equal(fs.readFileSync(file, 'utf8'), source);
      assert.equal(fs.existsSync(path.join(root, mode === 'single' ? 'setting.js' : 'src/setting.js')), both);
    }
  }
});
