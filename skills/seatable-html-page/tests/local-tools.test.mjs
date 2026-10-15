import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig, validateConfig, parseSetting, browserScript, privateRequestGuard, PRIVATE_FILE_DENY } from '../scripts/dev-config.mjs';
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
function settingFile(root) { return path.join(root, 'setting.js'); }
function saveSetting(root, value = config, mode = 'single') {
  const file = settingFile(root, mode);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `export default ${JSON.stringify(value)};\n`);
}
function setup(root, mode = 'single') {
  const result = run(root, 'setup-local.mjs');
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
    assert.deepEqual(fs.readdirSync(root).sort(), ['.gitignore', 'setting.js']);
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
    assert.equal(run(root, 'setup-local.mjs').status, 1);
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

test('single preview follows manifest additions, removals and deletion without restarting', async t => {
  const root = project(t);
  fs.writeFileSync(path.join(root, 'index.html'), html);
  fs.mkdirSync(path.join(root, 'assets'));
  const asset = path.join(root, 'assets/page.css');
  fs.writeFileSync(asset, 'body { color: green; }');
  fs.writeFileSync(path.join(root, 'unlisted.txt'), 'not public');
  saveSetting(root);
  const settingsSource = fs.readFileSync(settingFile(root), 'utf8');
  const manifest = path.join(root, 'deploy-files.json');
  const allowAsset = () => fs.writeFileSync(manifest, JSON.stringify({ files: ['index.html', 'assets/page.css'] }));
  const session = await startSinglePreview({ root, config: loadConfig(root), port: 0 });
  t.after(() => session.close());
  assert.equal((await request(session.port, '/assets/page.css')).status, 404);

  const updatedHtml = html.replace('</head>', '<link rel="stylesheet" href="./assets/page.css"></head>');
  fs.writeFileSync(path.join(root, 'index.html'), updatedHtml);
  allowAsset();
  const manifestSource = fs.readFileSync(manifest, 'utf8');
  assert.equal((await request(session.port, '/')).body, injectConfig(updatedHtml, config));
  const added = await request(session.port, '/assets/page.css?version=2');
  assert.equal(added.status, 200);
  assert.equal(added.body, fs.readFileSync(asset, 'utf8'));
  assert.equal(added.headers['cache-control'], 'no-store');
  assert.equal(added.headers['content-type'], 'text/css; charset=utf-8');
  const head = await request(session.port, '/assets/page.css', {}, 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  fs.writeFileSync(asset, 'body { color: blue; }');
  assert.equal((await request(session.port, '/assets/page.css')).body, 'body { color: blue; }');
  assert.equal(fs.readFileSync(manifest, 'utf8'), manifestSource);

  // Removing an entry must revoke it, even while the file still exists.
  fs.writeFileSync(manifest, JSON.stringify({ files: ['index.html'] }));
  assert.equal((await request(session.port, '/assets/page.css')).status, 404);
  allowAsset();
  assert.equal((await request(session.port, '/assets/page.css')).status, 200);
  // Removing the manifest restores index.html-only serving, not the old allowlist.
  fs.unlinkSync(manifest);
  assert.equal((await request(session.port, '/assets/page.css')).status, 404);
  assert.equal((await request(session.port, '/')).body, injectConfig(updatedHtml, config));
  assert.equal(fs.existsSync(manifest), false);
  allowAsset();
  assert.equal((await request(session.port, '/assets/page.css')).status, 200);
  for (const resource of ['/unlisted.txt', '/setting.js', '/deploy-files.json']) {
    assert.equal((await request(session.port, resource)).status, 404);
  }
  assert.equal(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), updatedHtml);
  assert.equal(fs.readFileSync(settingFile(root), 'utf8'), settingsSource);
});

test('single preview rejects invalid changed manifests and recovers without stale permissions', async t => {
  const root = project(t);
  fs.writeFileSync(path.join(root, 'index.html'), html);
  const asset = path.join(root, 'public.js');
  const assetSource = 'console.log("public");';
  fs.writeFileSync(asset, assetSource);
  saveSetting(root);
  const manifest = path.join(root, 'deploy-files.json');
  const validManifest = JSON.stringify({ files: ['index.html', 'public.js'] });
  fs.writeFileSync(manifest, validManifest);
  const linkedManifest = path.join(root, 'other-manifest.json');
  fs.writeFileSync(linkedManifest, validManifest);
  const session = await startSinglePreview({ root, config: loadConfig(root), port: 0 });
  t.after(() => session.close());
  assert.equal((await request(session.port, '/public.js')).status, 200);
  const changes = [
    ['malformed', () => fs.writeFileSync(manifest, `{"files": ["${config.accountToken}"`)],
    ['missing index', () => fs.writeFileSync(manifest, JSON.stringify({ files: ['public.js'] }))],
    ['duplicate', () => fs.writeFileSync(manifest, JSON.stringify({ files: ['index.html', 'index.html'] }))],
    ['private file', () => fs.writeFileSync(manifest, JSON.stringify({ files: ['index.html', 'setting.js'] }))],
    ['missing asset', () => fs.writeFileSync(manifest, JSON.stringify({ files: ['index.html', 'missing.js'] }))],
    ['linked manifest', () => { fs.unlinkSync(manifest); fs.symlinkSync(linkedManifest, manifest); }],
    ['linked asset', () => { fs.unlinkSync(asset); fs.symlinkSync(settingFile(root), asset); }],
    ['asset directory', () => { fs.unlinkSync(asset); fs.mkdirSync(asset); }],
  ];
  for (const [label, invalidate] of changes) {
    invalidate();
    // Fail closed for the whole invalid allowlist; never reuse its earlier entries.
    for (const resource of ['/', '/public.js']) {
      const result = await request(session.port, resource);
      assert.equal(result.status, 500, label);
      assert.equal(result.headers['cache-control'], 'no-store', label);
      assert.equal(result.body, 'Cannot safely read the preview file or local configuration. Check the files, then reload.', label);
    }
    const head = await request(session.port, '/public.js', {}, 'HEAD');
    assert.equal(head.status, 500, label);
    assert.equal(head.body, '', label);
    fs.rmSync(manifest, { force: true });
    fs.rmSync(asset, { force: true, recursive: true });
    fs.writeFileSync(manifest, validManifest);
    fs.writeFileSync(asset, assetSource);
    assert.equal((await request(session.port, '/')).body, injectConfig(html, config), label);
    const recovered = await request(session.port, '/public.js');
    assert.equal(recovered.status, 200, label);
    assert.equal(recovered.body, assetSource, label);
    assert.equal((await request(session.port, '/setting.js')).status, 404, label);
  }
});

test('single preview reads changed settings on every page load without restarting', async t => {
  const root = project(t);
  fs.writeFileSync(path.join(root, 'index.html'), html);
  saveSetting(root);
  const session = await startSinglePreview({ root, config: loadConfig(root), port: 0 });
  t.after(() => session.close());
  assert.equal((await request(session.port, '/')).body, injectConfig(html, config));

  const updated = { server: 'https://updated.invalid/service/', appUuid: 'updated-app', pageId: 'updated-page',
    accountToken: 'synthetic-updated-</script>-\u2028-\u2029-token' };
  saveSetting(root, updated);
  const settingsSource = fs.readFileSync(settingFile(root), 'utf8');
  for (const resource of ['/', '/index.html', '/index.html?reload=1']) {
    const result = await request(session.port, resource);
    assert.equal(result.status, 200);
    assert.equal(result.headers['cache-control'], 'no-store');
    assert.equal(result.body, injectConfig(html, updated));
    assert.equal(result.body.includes(config.accountToken), false);
    assert.equal(result.body.includes(updated.accountToken), false);
    assert.equal(result.body.split(browserScript(updated)).length, 2);
  }
  const head = await request(session.port, '/', {}, 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  assert.equal(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), html);
  assert.equal(fs.readFileSync(settingFile(root), 'utf8'), settingsSource);
});

test('single preview rejects unsafe changed settings and recovers without restarting', async t => {
  const root = project(t);
  assert.equal(spawnSync('git', ['init', root], { stdio: 'ignore' }).status, 0);
  setup(root);
  saveSetting(root);
  fs.writeFileSync(path.join(root, 'index.html'), html);
  const file = settingFile(root);
  const ignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  const marker = path.join(root, 'executed.txt');
  const linked = path.join(root, 'linked-settings.js');
  fs.writeFileSync(linked, fs.readFileSync(file));
  fs.mkdirSync(path.join(root, 'src'));
  const legacy = path.join(root, 'src/setting.js');
  const session = await startSinglePreview({ root, config: loadConfig(root), port: 0 });
  t.after(() => session.close());

  const changes = [
    ['missing', () => fs.unlinkSync(file)],
    ['malformed', () => fs.writeFileSync(file, 'export default { "accountToken": "synthetic-secret";')],
    ['incomplete', () => saveSetting(root, { ...config, pageId: '' })],
    ['executable', () => fs.writeFileSync(file,
      `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(marker)}, 'executed'); export default ${JSON.stringify(config)};`)],
    ['symlink', () => { fs.unlinkSync(file); fs.symlinkSync(linked, file); }],
    ['legacy', () => fs.writeFileSync(legacy, fs.readFileSync(file))],
    ['not ignored', () => fs.writeFileSync(path.join(root, '.gitignore'), '')],
    ['tracked', () => assert.equal(spawnSync('git', ['-C', root, 'add', '-f', 'setting.js'], { stdio: 'ignore' }).status, 0)],
  ];
  for (const [label, invalidate] of changes) {
    invalidate();
    for (const resource of ['/', '/index.html']) {
      const result = await request(session.port, resource);
      assert.equal(result.status, 500, label);
      assert.equal(result.headers['cache-control'], 'no-store', label);
      assert.equal(result.body, 'Cannot safely read the preview file or local configuration. Check the files, then reload.', label);
    }
    const head = await request(session.port, '/', {}, 'HEAD');
    assert.equal(head.status, 500, label);
    assert.equal(head.body, '', label);
    assert.equal(fs.existsSync(marker), false, label);
    fs.rmSync(file, { force: true });
    fs.rmSync(legacy, { force: true });
    fs.writeFileSync(path.join(root, '.gitignore'), ignore);
    assert.equal(spawnSync('git', ['-C', root, 'rm', '--cached', '--ignore-unmatch', 'setting.js'], { stdio: 'ignore' }).status, 0);
    saveSetting(root);
    assert.equal((await request(session.port, '/')).body, injectConfig(html, config), label);
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

for (const signal of ['SIGINT', 'SIGTERM']) {
  test(`preview CLI connects with local settings and stops on ${signal}`, { timeout: 10000 }, async t => {
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
    assert.match(log, /fully reload the browser; no preview restart is needed/);
    assert.equal(errors, '');
    assert.deepEqual(fs.readdirSync(root), before);
    assert.equal(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), html);
    assert.equal(fs.readFileSync(settingFile(root), 'utf8'), originalSettings);
    child.kill(signal);
    assert.equal(await closed, 0);
    await assert.rejects(request(port, '/'), { code: 'ECONNREFUSED' });
    assert.equal(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), html);
    assert.equal(fs.readFileSync(settingFile(root), 'utf8'), originalSettings);
  });
}

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
    assert.equal(run(root, 'setup-local.mjs').status, 1);
    assert.equal(fs.readFileSync(target, 'utf8'), original);
  }
});

function viteStub(root, failure = '') {
  const folder = path.join(root, 'node_modules/vite');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
  fs.writeFileSync(path.join(folder, 'package.json'), '{"name":"vite","type":"module","exports":"./index.mjs"}');
  fs.writeFileSync(path.join(folder, 'index.mjs'), `
    export async function createServer(options) {
      const failure = ${JSON.stringify(failure)};
      const deny = ${JSON.stringify(PRIVATE_FILE_DENY)};
      const plugin = {name:'seatable-local-settings', configureServer(){}, transformIndexHtml:{handler(){}}};
      const state = {options, listened:false, closed:false};
      globalThis.__seatableViteTest = state;
      return {
        config:{plugins:failure === 'plugin' ? [] : [plugin], server:{...options.server,
          host:failure === 'host' ? '0.0.0.0' : options.server.host,
          cors:failure === 'cors' ? true : options.server.cors,
          fs:{deny:failure === 'deny' ? deny.filter(rule => rule !== '**/setting.js') : deny}}},
        httpServer:{address:()=>({port:3005})},
        listen:async()=>{if(failure === 'listen') throw Error('synthetic failure'); state.listened=true},
        close:async()=>{state.closed=true}
      };
    }
  `);
}

test('Vite runner delegates injection to project config without changing settings or cwd', async t => {
  const root = project(t);
  setup(root, 'vite');
  viteStub(root);
  const previous = process.cwd();
  const dangerous = { ...config, accountToken: 'synthetic-</script>' };
  saveSetting(root, dangerous, 'vite');
  const originalFile = fs.readFileSync(path.join(root, 'setting.js'), 'utf8');
  const session = await startVitePreview({ root, config: dangerous, port: 3005 });
  const state = globalThis.__seatableViteTest;
  try {
    assert.equal(state.listened, true);
    assert.equal(state.options.configFile, path.join(root, 'vite.config.js'));
    assert.equal(state.options.server.host, '127.0.0.1');
    assert.equal(state.options.plugins, undefined, 'Runner must not add a second injection plugin');
    assert.equal(fs.readFileSync(path.join(root, 'setting.js'), 'utf8'), originalFile);
    assert.equal(fs.existsSync(path.join(root, 'src/setting.js')), false);
    assert.equal(process.cwd(), previous);
  } finally {
    await session.close();
    delete globalThis.__seatableViteTest;
  }
  assert.equal(process.cwd(), previous);
  assert.equal(state.closed, true);
});

test('Vite runner closes on missing project protection or a listen failure', async t => {
  for (const failure of ['deny', 'plugin', 'host', 'cors', 'listen']) {
    const root = project(t);
    setup(root, 'vite');
    viteStub(root, failure);
    const previous = process.cwd();
    try {
      await assert.rejects(startVitePreview({ root, config, port: 3005 }),
        failure === 'listen' ? /Cannot start Vite/ : /did not preserve/);
      assert.equal(globalThis.__seatableViteTest.listened, false, failure);
      assert.equal(globalThis.__seatableViteTest.closed, true, failure);
      assert.equal(process.cwd(), previous);
    } finally { delete globalThis.__seatableViteTest; }
  }
});

test('CLIs reject unknown options and do not expose values on configuration failure', t => {
  const root = project(t);
  setup(root);
  saveSetting(root, { ...config, pageId: '' });
  const result = run(root, 'preview.mjs', '--mode', 'single');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /pageId/);
  assert.equal((result.stdout + result.stderr).includes(config.accountToken), false);
  for (const script of ['preview.mjs', 'setup-local.mjs', 'prepare-vite.mjs', 'verify-local.mjs']) {
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
    const file = settingFile(root);
    for (const item of cases) {
      fs.writeFileSync(file, item.source);
      if (item.config) assert.deepEqual(loadConfig(root, mode), item.config, `${mode}: ${item.name}`);
      else assert.throws(() => loadConfig(root, mode), error => !error.message.includes('synthetic-fixture-token'), `${mode}: ${item.name}`);
      assert.equal(fs.readFileSync(file, 'utf8'), item.source);
    }
  }
  assert.equal(globalThis.SYNTHETIC_CONFIG_EXECUTED, undefined);
});

test('legacy settings stop setup/loading before changes, with or without root settings', t => {
  for (const both of [false, true]) {
    const root = project(t);
    fs.mkdirSync(path.join(root, 'src'));
    const legacy = path.join(root, 'src/setting.js');
    fs.writeFileSync(legacy, `export default ${JSON.stringify(config)};`);
    if (both) saveSetting(root);
    const ignore = '# user-owned ignore rules\n';
    fs.writeFileSync(path.join(root, '.gitignore'), ignore);
    const original = fs.readFileSync(legacy, 'utf8');
    const result = run(root, 'setup-local.mjs');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Migrate it explicitly/);
    assert.equal(result.stderr.includes(config.accountToken), false);
    assert.throws(() => loadConfig(root), /Migrate it explicitly/);
    assert.equal(fs.readFileSync(path.join(root, '.gitignore'), 'utf8'), ignore);
    assert.equal(fs.readFileSync(legacy, 'utf8'), original);
    assert.equal(fs.existsSync(path.join(root, 'setting.js')), both);
  }
});

test('setup appends system-file ignores once and ignores nested OS files without untracking', t => {
  const root = project(t);
  const git = (...args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  assert.equal(git('init', '-q').status, 0);
  fs.writeFileSync(path.join(root, '.gitignore'), '# custom\ncustom/\n.DS_Store\n');
  fs.writeFileSync(path.join(root, 'Thumbs.db'), 'already tracked');
  assert.equal(git('add', 'Thumbs.db').status, 0);
  setup(root);
  const before = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  setup(root);
  assert.equal(fs.readFileSync(path.join(root, '.gitignore'), 'utf8'), before);
  assert.ok(before.startsWith('# custom\ncustom/\n.DS_Store\n'));
  for (const name of ['setting.js', 'src/setting.js', '.DS_Store', 'nested/.DS_Store', 'nested/._file', 'nested/__MACOSX/file', 'nested/Thumbs.db', 'nested/Desktop.ini', 'desktop.ini']) {
    assert.equal(git('check-ignore', '-q', '--no-index', '--', name).status, 0, name);
  }
  assert.equal(git('ls-files', '--error-unmatch', '--', 'Thumbs.db').status, 0);
});


test('private request guard rejects private URL variants before SPA fallback', () => {
  const blocked = ['/setting.js', '/SETTING.JS?raw', '/%73etting.js', '/src/setting.js?import',
    '/setting.template.js', '/.git/config', '/.gitignore', '/.seatable/token', '/.env', '/.ENV.local',
    '/@fs/private/page/setting.js?raw', '/nested%2fsetting.js', '/nested%5csetting.js'];
  for (const url of [...blocked, '/%invalid']) {
    let status, body, next = false;
    privateRequestGuard({ url }, { writeHead(code) { status = code; }, end(text) { body = text; } }, () => { next = true; });
    assert.equal(status, url === '/%invalid' ? 400 : 404, url);
    assert.equal(next, false, url);
    assert.equal(body.includes(config.accountToken), false);
  }
  for (const url of ['/', '/index.html', '/index.js', '/assets/setting-icon.svg']) {
    let next = false;
    privateRequestGuard({ url }, { writeHead() { assert.fail(url); } }, () => { next = true; });
    assert.equal(next, true, url);
  }
});
