import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { prepareVite, prepareViteFromTemplate } from '../scripts/prepare-vite.mjs';
import { parseSetting, browserScript, loadConfig, PRIVATE_FILE_DENY } from '../scripts/dev-config.mjs';

const config = { server: 'https://example.invalid/service/', appUuid: 'synthetic-app', pageId: 'synthetic-page', accountToken: 'synthetic-</script>-token' };
// Preserve the credential-logging block from the documented official template snapshot.
const templateApp = `export default class App {
  async init() {
    this.uiManager.showLoading();
    const options = window.__HTML_PAGE_DEV_CONFIG__ || null;
    if (options) {
      console.log('Local settings:', options);
    }
    await this.context.init(options);
    console.log('Page initialized');
  }
}
`;
function project(t, template = false) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'seatable-vite-project-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  if (template) {
    fs.mkdirSync(path.join(root, 'src/esm/model'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/classic'), { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'seatable-html-page-template-simple-form', type: 'module' }));
    fs.writeFileSync(path.join(root, 'src/esm/index.html'), '<html><head></head><body><script type="module" src="./index.js"></script></body></html>');
    fs.writeFileSync(path.join(root, 'src/esm/index.js'), "import './model/item.js';");
    fs.writeFileSync(path.join(root, 'src/esm/app.js'), templateApp);
    fs.writeFileSync(path.join(root, 'src/esm/model/item.js'), 'export default 42;');
    fs.writeFileSync(path.join(root, 'src/classic/index.html'), 'Unused demo');
    fs.writeFileSync(path.join(root, '.env'), 'ESM=false\nVITE_DEV_PORT=3005\nPROXY_PATH=/html-page\n');
    fs.writeFileSync(path.join(root, '.env.local'), 'ESM=true\nOTHER_VALUE=kept\n');
    fs.writeFileSync(path.join(root, 'eslint.config.js'), "import globals from 'globals';\nexport default [\n { ignores: ['dist', 'node_modules'] },\n];\n");
  }
  return root;
}
function save(root, value = config) {
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'setting.js'), `export default ${JSON.stringify(value)};\n`);
  fs.writeFileSync(path.join(root, '.gitignore'), '/setting.js\n');
}

async function normalizedProject(t) {
  const root = project(t, true);
  prepareVite(root);
  for (const [name, source] of [['vite', 'export const defineConfig = f => f; export const loadEnv = () => ({ ESM:"false", VITE_DEV_PORT:"4000" });'], ['vite-plugin-eslint', 'export default options => ({name:"eslint-stub",options});']]) {
    const folder = path.join(root, 'node_modules', name);
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'package.json'), JSON.stringify({ name, type: 'module', exports: './index.js' }));
    fs.writeFileSync(path.join(folder, 'index.js'), source);
  }
  const { default: buildConfig } = await import(pathToFileURL(path.join(root, 'vite.config.js')).href);
  const plugin = buildConfig({ mode: 'development', command: 'serve' }).plugins[0];
  return { root, buildConfig, plugin };
}

test('fresh template becomes ESM-only src with relative entries and no credentials/artifacts', t => {
  const root = project(t, true);
  prepareVite(root);
  assert.match(fs.readFileSync(path.join(root, 'src/index.html'), 'utf8'), /src="\.\/index\.js"/);
  assert.equal(fs.readFileSync(path.join(root, 'src/model/item.js'), 'utf8'), 'export default 42;');
  assert.match(fs.readFileSync(path.join(root, '.env'), 'utf8'), /VITE_DEV_PORT=3005/);
  assert.equal(fs.readFileSync(path.join(root, '.env'), 'utf8').includes('ESM='), false);
  assert.equal(fs.readFileSync(path.join(root, '.env.local'), 'utf8'), 'OTHER_VALUE=kept\n');
  for (const name of ['src/esm', 'src/classic', 'setting.js', 'src/setting.js', 'tests', 'dist', 'page-zip', 'deploy-files.json']) assert.equal(fs.existsSync(path.join(root, name)), false, name);
  assert.equal(fs.existsSync(path.join(root, 'scripts/vite-dev-plugin.mjs')), false);
  assert.equal(fs.existsSync(path.join(root, 'scripts/dev-config.mjs')), false);
  const generated = fs.readFileSync(path.join(root, 'vite.config.js'), 'utf8');
  assert.equal(generated.includes('__SEATABLE_LOCAL_CONFIG__'), false);
  assert.equal(generated.includes(path.resolve('scripts/dev-config.mjs')), false);
  assert.deepEqual(parseSetting(fs.readFileSync(path.join(root, 'setting.template.js'), 'utf8')), { server: '', appUuid: '', pageId: '', accountToken: '' });
  assert.throws(() => prepareVite(root), /fresh official/);
});

test('both template preparation paths remove credential logging without changing SDK context or other logs', async t => {
  for (const merge of [false, true]) {
    for (const [newline, quote] of [['\n', "'"], ['\r\n', '"']]) {
      const template = project(t, true);
      const original = templateApp.replace("'Local settings:'", `${quote}Local settings:${quote}`).replace(/\n/g, newline);
      fs.writeFileSync(path.join(template, 'src/esm/app.js'), original);
      const root = merge ? project(t) : template;
      if (merge) {
        save(root);
        fs.rmdirSync(path.join(root, 'src'));
        prepareViteFromTemplate(root, template);
        assert.equal(fs.readFileSync(path.join(template, 'src/esm/app.js'), 'utf8'), original);
      } else prepareVite(root);
      const source = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
      assert.equal(source, original.replace(`    if (options) {${newline}      console.log(${quote}Local settings:${quote}, options);${newline}    }${newline}`, ''));
      const logs = [], received = [];
      const window = { __HTML_PAGE_DEV_CONFIG__: config };
      const App = vm.runInNewContext(source.replace('export default class App', 'class App') + '\nApp;', {
        window, console: { log: (...values) => logs.push(values) },
      });
      const app = new App();
      let loading = 0;
      app.uiManager = { showLoading() { loading++; } };
      app.context = { async init(options) { received.push(options); } };
      await app.init();
      window.__HTML_PAGE_DEV_CONFIG__ = null;
      await app.init();
      assert.deepEqual(received, [config, null]);
      assert.deepEqual(logs, [['Page initialized'], ['Page initialized']]);
      assert.equal(loading, 2);
    }
  }
});

test('template collisions and existing local settings stop before changes', t => {
  for (const name of ['src/index.js', 'src/setting.js', 'scripts/dev-config.mjs']) {
    const root = project(t, true);
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), 'Existing user file');
    assert.throws(() => prepareVite(root));
    assert.equal(fs.readFileSync(path.join(root, '.env'), 'utf8').startsWith('ESM=false'), true);
    assert.equal(fs.existsSync(path.join(root, 'src/esm/index.html')), true);
    assert.equal(fs.readFileSync(path.join(root, name), 'utf8'), 'Existing user file');
  }
});

test('unsafe template paths and changed lint config stop before normalization', t => {
  for (const kind of ['dangling-classic', 'directory-config', 'changed-lint']) {
    const root = project(t, true);
    if (kind === 'dangling-classic') {
      fs.unlinkSync(path.join(root, 'src/classic/index.html'));
      fs.rmdirSync(path.join(root, 'src/classic'));
      fs.symlinkSync(path.join(root, 'missing-classic'), path.join(root, 'src/classic'));
    } else if (kind === 'directory-config') {
      fs.mkdirSync(path.join(root, 'vite.config.js'));
    } else {
      fs.writeFileSync(path.join(root, 'eslint.config.js'), 'export default [];');
    }
    assert.throws(() => prepareVite(root));
    assert.equal(fs.existsSync(path.join(root, 'src/esm/index.html')), true);
    assert.equal(fs.readFileSync(path.join(root, '.env'), 'utf8').startsWith('ESM=false'), true);
    assert.equal(fs.existsSync(path.join(root, 'scripts/vite-dev-plugin.mjs')), false);
  }
});

test('normalized config fixes src root, env directory and hashes independently of ESM flags', async t => {
  const { root, buildConfig } = await normalizedProject(t);
  for (const mode of ['production', 'development']) {
    const production = buildConfig({ mode, command: 'build' });
    assert.equal(production.root, path.join(root, 'src'));
    assert.equal(production.envDir, root);
    assert.equal(production.base, './');
    assert.equal(production.build.outDir, path.join(root, 'dist'));
    assert.match(production.build.rollupOptions.output.entryFileNames, /\[hash\]/);
    assert.equal(production.resolve.alias['@'], path.join(root, 'src'));
    assert.equal(production.plugins.some(plugin => plugin.name === 'seatable-local-settings'), false);
  }
  const development = buildConfig({ mode: 'development', command: 'serve' });
  assert.equal(development.plugins[0].apply, 'serve');
});

test('inline serve plugin reads user settings and needs no generated helpers', async t => {
  const { root, plugin } = await normalizedProject(t);
  const html = '<head></head><body></body>';
  assert.throws(() => plugin.transformIndexHtml.handler(html), /connection file is missing/);
  save(root);
  const original = fs.readFileSync(path.join(root, 'setting.js'), 'utf8');
  const injected = plugin.transformIndexHtml.handler(html);
  assert.equal(injected.includes(config.accountToken), false);
  assert.equal(injected.includes(browserScript(config)), true);
  assert.equal(fs.readFileSync(path.join(root, 'setting.js'), 'utf8'), original);
  save(root, { ...config, pageId: 'changed-target' });
  assert.match(plugin.transformIndexHtml.handler(html), /changed-target/);
  assert.equal(fs.existsSync(path.join(root, 'src/setting.js')), false);
  assert.throws(() => plugin.transformIndexHtml.handler(injected), /no existing SDK/);
  save(root, { ...config, pageId: '' });
  assert.throws(() => plugin.transformIndexHtml.handler(html), /pageId/);
});


test('inline plugin rejects invalid connection values without exposing or rewriting input', async t => {
  const { root, plugin } = await normalizedProject(t);
  const file = path.join(root, 'setting.js');
  for (const value of [{ ...config, pageId: '' }, { ...config, server: 'javascript:SECRET' }]) {
    const source = `export default ${JSON.stringify(value)};`;
    fs.writeFileSync(file, source);
    assert.throws(() => plugin.transformIndexHtml.handler('<head></head>'), error => !error.message.includes('SECRET'));
    assert.equal(fs.readFileSync(file, 'utf8'), source);
  }
});

test('inline plugin rejects legacy input, symlinks and Git-tracked credentials', async t => {
  const { root, plugin } = await normalizedProject(t);
  const html = '<head></head>';
  const wrongMode = path.join(root, 'src/setting.js');
  fs.writeFileSync(wrongMode, 'SECRET');
  assert.throws(() => plugin.transformIndexHtml.handler(html), error => /Migrate it explicitly/.test(error.message) && !error.message.includes('SECRET'));
  fs.unlinkSync(wrongMode);
  const file = path.join(root, 'setting.js');
  fs.symlinkSync(path.join(root, 'missing-setting'), file);
  assert.throws(() => plugin.transformIndexHtml.handler(html), /symbolic links/);
  fs.unlinkSync(file);
  save(root);
  const git = (...args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  assert.equal(git('init', '-q').status, 0);
  assert.match(plugin.transformIndexHtml.handler(html), /__HTML_PAGE_DEV_CONFIG__/);
  fs.writeFileSync(path.join(root, '.gitignore'), '');
  assert.throws(() => plugin.transformIndexHtml.handler(html), /Git-ignored/);
  fs.writeFileSync(path.join(root, '.gitignore'), '/setting.js\n');
  assert.equal(git('add', '-f', 'setting.js').status, 0);
  assert.throws(() => plugin.transformIndexHtml.handler(html), /untracked/);
});

test('build never reads settings and inline serve hooks preserve private-file restrictions', async t => {
  const { root, buildConfig, plugin } = await normalizedProject(t);
  const file = path.join(root, 'setting.js');
  fs.symlinkSync(path.join(root, 'missing-setting'), file);
  assert.equal(buildConfig({ mode: 'development', command: 'build' }).plugins.some(p => p.name === 'seatable-local-settings'), false);
  const protection = plugin.config({ server: { fs: { deny: ['custom-private'] } } });
  assert.equal(protection.server.host, '127.0.0.1');
  assert.equal(protection.server.cors, false);
  for (const name of ['custom-private', ...PRIVATE_FILE_DENY]) assert.ok(protection.server.fs.deny.includes(name));
  const watched = [], sent = [];
  const server = { middlewares: { use: () => {} }, watcher: { add: value => watched.push(value) }, ws: { send: value => sent.push(value) } };
  assert.throws(() => plugin.configureServer(server), /symbolic links/);
  fs.unlinkSync(file);
  save(root);
  plugin.configureServer(server);
  assert.deepEqual(watched, [file]);
  assert.deepEqual(plugin.handleHotUpdate({ file, server }), []);
  assert.deepEqual(sent, [{ type: 'full-reload', path: '*' }]);
});

test('self-contained Vite configuration accepts/rejects the shared static-settings fixtures', async t => {
  const { root, plugin } = await normalizedProject(t);
  const file = path.join(root, 'setting.js');
  const html = '<head></head><body></body>';
  const cases = JSON.parse(fs.readFileSync(new URL('./fixtures/static-settings.json', import.meta.url), 'utf8'));
  for (const item of cases) {
    fs.writeFileSync(file, item.source);
    if (item.config) {
      assert.deepEqual(loadConfig(root), item.config, item.name);
      assert.equal(plugin.transformIndexHtml.handler(html).includes(browserScript(loadConfig(root))), true, item.name);
    } else {
      let cliError;
      try { loadConfig(root); } catch (error) { cliError = error.message; }
      assert.ok(cliError, item.name);
      assert.throws(() => plugin.transformIndexHtml.handler(html), error => error.message === cliError, item.name);
    }
    assert.equal(fs.readFileSync(file, 'utf8'), item.source);
  }
  assert.equal(globalThis.SYNTHETIC_CONFIG_EXECUTED, undefined);
});


test('config-first template merge preserves root settings, permissions and existing ignore rules', t => {
  const root = project(t), template = project(t, true);
  save(root);
  // The configuration phase creates no src tree.
  fs.rmdirSync(path.join(root, 'src'));
  fs.chmodSync(path.join(root, 'setting.js'), 0o600);
  fs.appendFileSync(path.join(root, '.gitignore'), '# custom\nkeep-me/\n');
  const original = fs.readFileSync(path.join(root, 'setting.js'), 'utf8');
  prepareViteFromTemplate(root, template);
  assert.equal(fs.readFileSync(path.join(root, 'setting.js'), 'utf8'), original);
  assert.equal(fs.statSync(path.join(root, 'setting.js')).mode & 0o777, 0o600);
  assert.equal(fs.existsSync(path.join(root, 'src/index.html')), true);
  assert.equal(fs.existsSync(path.join(root, 'src/setting.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'src/setting.template.js')), false);
  assert.match(fs.readFileSync(path.join(root, '.gitignore'), 'utf8'), /keep-me\//);
  assert.equal(fs.existsSync(path.join(template, 'src/esm/index.html')), true);
});

test('template merge rejects collisions before modifying a config-first project', t => {
  for (const name of ['src', 'README.md', 'package.json']) {
    const root = project(t), template = project(t, true);
    fs.writeFileSync(path.join(template, 'README.md'), 'template');
    fs.writeFileSync(path.join(root, 'setting.js'), 'private user input');
    fs.writeFileSync(path.join(root, '.gitignore'), '/setting.js\n');
    if (name === 'src') fs.mkdirSync(path.join(root, name));
    else fs.writeFileSync(path.join(root, name), 'preserve');
    const before = fs.readdirSync(root).sort();
    assert.throws(() => prepareViteFromTemplate(root, template), /overwrite/);
    assert.deepEqual(fs.readdirSync(root).sort(), before);
    assert.equal(fs.readFileSync(path.join(root, '.gitignore'), 'utf8'), '/setting.js\n');
    assert.equal(fs.readFileSync(path.join(root, 'setting.js'), 'utf8'), 'private user input');
  }
});

test('in-place normalization also preserves existing root configuration', t => {
  const root = project(t, true);
  save(root);
  const original = fs.readFileSync(path.join(root, 'setting.js'), 'utf8');
  prepareVite(root);
  assert.equal(fs.readFileSync(path.join(root, 'setting.js'), 'utf8'), original);
  assert.equal(fs.existsSync(path.join(root, 'src/index.html')), true);
});


test('self-contained Vite middleware rejects private paths before HTML fallback', async t => {
  const { root, plugin } = await normalizedProject(t);
  let guard;
  save(root);
  plugin.configureServer({ middlewares: { use(fn) { guard = fn; } }, watcher: { add() {} } });
  for (const url of ['/setting.js', '/SETTING.JS?raw', '/%73etting.js', '/@fs/private/setting.js?raw',
    '/nested%2fsetting.js', '/nested%5csetting.js', '/setting.template.js', '/.git/config', '/.gitignore', '/.ENV.local', '/.seatable/key', '/%invalid']) {
    let status, next = false;
    guard({ url }, { writeHead(code) { status = code; }, end(text) { assert.equal(text.includes(config.accountToken), false); } }, () => { next = true; });
    assert.equal(status, url === '/%invalid' ? 400 : 404, url);
    assert.equal(next, false, url);
  }
  let next = false;
  guard({ url: '/index.js' }, { writeHead() { assert.fail(); } }, () => { next = true; });
  assert.equal(next, true);
});

test('template ignore negations cannot weaken config-first credential protection', t => {
  const root = project(t), template = project(t, true);
  save(root);
  fs.rmdirSync(path.join(root, 'src'));
  fs.appendFileSync(path.join(template, '.gitignore'), '/setting.js\n!/setting.js\n');
  const originalIgnore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  const originalSetting = fs.readFileSync(path.join(root, 'setting.js'), 'utf8');
  assert.throws(() => prepareViteFromTemplate(root, template), /expose local credentials/);
  assert.equal(fs.readFileSync(path.join(root, '.gitignore'), 'utf8'), originalIgnore);
  assert.equal(fs.readFileSync(path.join(root, 'setting.js'), 'utf8'), originalSetting);
  assert.equal(fs.existsSync(path.join(root, 'package.json')), false);
  assert.equal(fs.existsSync(path.join(root, 'src')), false);
});


test('fresh templates cannot carry credentials hidden in either source branch', t => {
  for (const name of ['src/esm/setting.js', 'src/classic/setting.js']) {
    const root = project(t, true);
    fs.writeFileSync(path.join(root, name), 'private source input');
    assert.throws(() => prepareVite(root), /source contains local settings/);
    assert.equal(fs.readFileSync(path.join(root, name), 'utf8'), 'private source input');
    assert.equal(fs.existsSync(path.join(root, 'src/esm/index.html')), true);
    assert.equal(fs.existsSync(path.join(root, 'vite.config.js')), false);
  }
});
