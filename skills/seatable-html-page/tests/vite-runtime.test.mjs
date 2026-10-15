/** Optional real-runtime checks: supply an existing dependency directory; never install packages. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { prepareViteFromTemplate } from '../scripts/prepare-vite.mjs';
import { browserScript, loadConfig, writePrivate } from '../scripts/dev-config.mjs';
import { startVitePreview } from '../scripts/preview.mjs';

const dependencies = process.env.SEATABLE_VITE_NODE_MODULES;
const options = { skip: !dependencies && 'Set SEATABLE_VITE_NODE_MODULES to an installed Vite/ESLint dependency directory.' };
const skill = fileURLToPath(new URL('..', import.meta.url));
const settings = { server: 'https://example.invalid/service/', appUuid: 'synthetic-app', pageId: 'synthetic-page', accountToken: 'synthetic-</script>-runtime-token' };
function project(t) {
  const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'seatable-real-vite-')));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const root = path.join(work, 'page'), template = path.join(work, 'template');
  fs.mkdirSync(root);
  fs.mkdirSync(path.join(template, 'src/esm'), { recursive: true });
  fs.writeFileSync(path.join(template, 'package.json'), JSON.stringify({ name: 'seatable-html-page-template-simple-form', type: 'module' }));
  fs.writeFileSync(path.join(template, 'src/esm/index.html'), '<html><head></head><body><script type="module" src="./index.js"></script></body></html>');
  fs.writeFileSync(path.join(template, 'src/esm/index.js'), 'globalThis.syntheticPageLoaded = true;');
  fs.writeFileSync(path.join(template, 'eslint.config.js'), "import globals from 'globals';\nexport default [\n{ ignores: ['dist', 'node_modules'] },\n];\n");
  assert.equal(spawnSync(process.execPath, [path.join(skill, 'scripts/setup-local.mjs'), '--project', root]).status, 0);
  writePrivate(root, path.join(root, 'setting.js'), `export default ${JSON.stringify(settings)};`);
  prepareViteFromTemplate(root, template);
  // Link packages individually: Vite caches/config bundles are written only in this temporary project.
  fs.mkdirSync(path.join(root, 'node_modules'));
  for (const name of fs.readdirSync(dependencies)) {
    if (!name.startsWith('.')) fs.symlinkSync(path.join(dependencies, name), path.join(root, 'node_modules', name));
  }
  return root;
}
async function runtime(root) {
  const require = createRequire(path.join(root, 'package.json'));
  return import(pathToFileURL(require.resolve('vite')).href);
}
async function get(port, resource) {
  const response = await fetch(`http://127.0.0.1:${port}${resource}`);
  return { status: response.status, text: await response.text() };
}

test('real Vite serves root settings from outside project cwd, reloads and blocks private URLs', options, async t => {
  const root = project(t), original = fs.readFileSync(path.join(root, 'setting.js'), 'utf8');
  const vite = await runtime(root);
  assert.notEqual(process.cwd(), root);
  const server = await vite.createServer({ configFile: path.join(root, 'vite.config.js'), logLevel: 'silent', server: { port: 0 } });
  try {
    await server.listen();
    const port = server.httpServer.address().port;
    let page = await get(port, '/');
    assert.equal(page.status, 200);
    assert.equal(page.text.includes(browserScript(settings)), true);
    assert.equal(page.text.split('window.__HTML_PAGE_DEV_CONFIG__ =').length - 1, 1);
    assert.equal((await get(port, '/index.js')).status, 200);
    for (const url of ['/setting.js', '/SETTING.JS', '/%53ETTING.JS', '/src/setting.js?raw', '/setting.template.js', '/.env.local', '/@fs' + path.join(root, 'setting.js'), '/@fs' + path.join(root, 'setting.js') + '?raw', '/@fs' + path.join(root, '.gitignore')]) {
      const result = await get(port, url);
      assert.ok([403, 404].includes(result.status), `${url}: ${result.status}`);
      assert.equal(result.text.includes(settings.accountToken), false);
    }
    const changed = { ...settings, pageId: 'updated-synthetic-page' };
    writePrivate(root, path.join(root, 'setting.js'), `export default ${JSON.stringify(changed)};`);
    page = await get(port, '/');
    assert.equal(page.text.includes(browserScript(changed)), true);
    assert.equal(fs.existsSync(path.join(root, 'src/setting.js')), false);
    writePrivate(root, path.join(root, 'setting.js'), original);
    await server.waitForRequestsIdle();
  } finally { await server.close(); }
  assert.equal(fs.readFileSync(path.join(root, 'setting.js'), 'utf8'), original);
});

test('real Vite Skill runner reads root settings, serves reloads and closes its listener', options, async t => {
  const root = project(t);
  const cwd = process.cwd();
  const session = await startVitePreview({ root, config: loadConfig(root), port: 0 });
  const port = session.port;
  try {
    const page = await get(port, '/');
    assert.equal(page.text.includes(browserScript(settings)), true);
    assert.equal(page.text.split('window.__HTML_PAGE_DEV_CONFIG__ =').length - 1, 1);
    const privateFile = await get(port, '/@fs' + path.join(root, 'setting.js') + '?raw');
    assert.ok([403, 404].includes(privateFile.status));
    assert.equal(privateFile.text.includes(settings.accountToken), false);
    assert.equal((await get(port, '/index.js')).status, 200);
    const changed = { ...settings, pageId: 'changed-runner-target' };
    writePrivate(root, path.join(root, 'setting.js'), `export default ${JSON.stringify(changed)};`);
    const reloaded = await get(port, '/');
    assert.equal(reloaded.text.includes(browserScript(changed)), true);
    assert.equal(reloaded.text.split('window.__HTML_PAGE_DEV_CONFIG__ =').length - 1, 1);
  } finally { await session.close(); }
  assert.equal(process.cwd(), cwd);
  await assert.rejects(get(port, '/'));
  assert.equal(fs.existsSync(path.join(root, 'setting.js')), true);
});

test('real builds omit private settings and production output packages into a checked ZIP', options, async t => {
  const root = project(t), vite = await runtime(root);
  // The sentinel would throw if the production build imported/executed settings.
  fs.writeFileSync(path.join(root, 'setting.js'), 'throw new Error("SYNTHETIC_PRIVATE_BUILD_SENTINEL");');
  for (const mode of ['production', 'development']) {
    await vite.build({ configFile: path.join(root, 'vite.config.js'), mode, logLevel: 'silent' });
    const files = fs.readdirSync(path.join(root, 'dist'), { recursive: true }).filter(name => fs.statSync(path.join(root, 'dist', name)).isFile());
    assert.ok(files.includes('index.html'));
    assert.ok(files.some(name => /-[\w-]+\.js$/.test(name)));
    for (const name of files) {
      const text = fs.readFileSync(path.join(root, 'dist', name), 'utf8');
      for (const secret of ['SYNTHETIC_PRIVATE_BUILD_SENTINEL', settings.accountToken, '__HTML_PAGE_DEV_CONFIG__ =']) assert.equal(text.includes(secret), false, name);
    }
  }
  fs.unlinkSync(path.join(root, 'setting.js'));
  await vite.build({ configFile: path.join(root, 'vite.config.js'), logLevel: 'silent' });
  const check = target => {
    const result = spawnSync('python3', ['-B', path.join(skill, 'scripts/check-page.py'), target, '--project', root], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  };
  check(path.join(root, 'dist')); // No credentials required for deployment checks/packaging.
  fs.mkdirSync(path.join(root, 'page-zip'));
  const archive = path.join(root, 'page-zip/html-page');
  // This fixture has no packaging script: use the documented dist-only fallback.
  const packed = spawnSync('python3', ['-B', '-c',
    'import shutil,sys; shutil.make_archive(sys.argv[1], "zip", sys.argv[2])',
    archive, path.join(root, 'dist')], { encoding: 'utf8' });
  assert.equal(packed.status, 0, packed.stderr);
  check(archive + '.zip');
  writePrivate(root, path.join(root, 'setting.js'), `export default ${JSON.stringify(settings)};`);
  check(archive + '.zip'); // A present root token is scanned, never packaged.
});
