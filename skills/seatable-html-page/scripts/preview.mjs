#!/usr/bin/env node
/** Local-only preview. This tool never requests SeaTable data itself. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { parseOptions, projectRoot, loadConfig, validateConfig, assertNoSymlinks, browserScript } from './dev-config.mjs';

const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

// Keep preview resource selection local; never expose the entire project tree.
const forbidden = new Set(['.git', '.seatable', 'node_modules', 'src', 'scripts', 'page-zip', 'dist', 'test', 'tests', '__tests__', 'coverage']);
export function isDeployPath(name) {
  if (typeof name !== 'string' || !name || name.includes('\\') || name.includes('\0') || name.startsWith('/') || path.posix.normalize(name) !== name) return false;
  // Match private paths case-insensitively even on case-insensitive filesystems.
  const parts = name.toLowerCase().split('/');
  const last = parts.at(-1);
  return !parts.some(part => !part || part.startsWith('.') || forbidden.has(part)) &&
    !['setting.js', 'setting.template.js', 'deploy-files.json', 'data-contract.json', 'package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml'].includes(last) &&
    !/(?:^.*\.(?:test|spec)\.(?:[cm]?[jt]sx?)$|^(?:vite|vitest|webpack|rollup|eslint|jest|babel|postcss|tailwind)\.config\.(?:[cm]?[jt]s|json)$|^tsconfig(?:\.[\w-]+)?\.json$)/i.test(last) &&
    !last.includes('.local.') && !last.endsWith('.local') && !/\.(?:zip|md|toml|ya?ml)$/i.test(last);
}

export function loadManifest(root) {
  const manifest = path.join(root, 'deploy-files.json');
  assertNoSymlinks(root, manifest);
  // An absent manifest is a minimal allowlist, never permission to scan the project.
  let names = ['index.html'];
  if (fs.existsSync(manifest)) {
    let data;
    try { data = JSON.parse(fs.readFileSync(manifest, 'utf8')); }
    catch { throw new Error('Cannot read valid JSON from deployment manifest. Contents were not displayed.'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('deployment manifest must be a JSON object.');
    names = data.files;
  }
  if (!Array.isArray(names) || !names.includes('index.html') || names.length === 0 || new Set(names).size !== names.length || !names.every(isDeployPath)) {
    throw new Error('deploy-files.json must explicitly list index.html and safe deployment assets, without duplicates or development files.');
  }
  const files = new Map();
  for (const name of names) {
    const file = path.join(root, name);
    assertNoSymlinks(root, file);
    try { if (!fs.statSync(file).isFile()) throw new Error(); }
    catch { throw new Error('A deployment allowlist file is missing or not a regular file.'); }
    files.set(name, file);
  }
  return files;
}

export function injectConfig(html, config) {
  validateConfig(config);
  if (!/<head\b[^>]*>/i.test(html)) throw new Error('Single-file preview needs an explicit <head> element.');
  if (/__HTML_PAGE_DEV_CONFIG__\s*=(?!=)/.test(html)) throw new Error('Page source already contains development configuration. Remove it before preview.');
  return html.replace(/<head\b[^>]*>/i, opening => `${opening}\n<script>${browserScript(config)}</script>`);
}

async function startStaticPreview({ root, files, config, port }) {
  // Preflight before opening the port; source remains unchanged.
  injectConfig(fs.readFileSync(files.get('index.html'), 'utf8'), config);
  const server = http.createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    const finish = (status, text) => { response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end(request.method === 'HEAD' ? undefined : text); };
    const expectedPort = server.address().port;
    const allowedHosts = [`127.0.0.1:${expectedPort}`, `localhost:${expectedPort}`];
    if (!allowedHosts.includes(request.headers.host) || request.headers['sec-fetch-site'] === 'cross-site') return finish(403, 'Local preview only.');
    if (request.headers.origin && !allowedHosts.some(host => request.headers.origin === `http://${host}`)) return finish(403, 'Origin not allowed.');
    if (!['GET', 'HEAD'].includes(request.method)) return finish(405, 'Only GET/HEAD are supported.');
    let name;
    try {
      const rawPath = request.url.split('?')[0];
      if (!rawPath.startsWith('/') || rawPath.startsWith('//')) return finish(404, 'Not found.');
      name = decodeURIComponent(rawPath.slice(1)) || 'index.html';
    } catch { return finish(400, 'Invalid path.'); }
    const file = files.get(name);
    if (!file) return finish(404, 'Not found.');
    try {
      assertNoSymlinks(root, file);
      let content = fs.readFileSync(file);
      if (name === 'index.html') content = Buffer.from(injectConfig(content.toString('utf8'), config));
      response.writeHead(200, { 'Content-Type': mime[path.extname(name).toLowerCase()] || 'application/octet-stream' });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch { finish(500, 'Cannot safely read the preview file.'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { port: server.address().port, close: () => new Promise(resolve => server.close(resolve)) };
}

export async function startSinglePreview({ root, config, port }) {
  return startStaticPreview({ root, files: loadManifest(root), config, port });
}

export async function startVitePreview({ root, config, port }) {
  validateConfig(config);
  let vite;
  try {
    const require = createRequire(path.join(root, 'package.json'));
    vite = await import(pathToFileURL(require.resolve('vite')).href);
  } catch { throw new Error('Cannot load project-local Vite. Install the project dependencies first; no dependencies were installed automatically.'); }
  const previousCwd = process.cwd();
  // The official template resolves its source root and .env from the project cwd.
  process.chdir(root);
  let server;
  try {
    server = await vite.createServer({
      mode: 'development',
      server: { host: '127.0.0.1', port, strictPort: true, allowedHosts: ['localhost'], cors: false,
        headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } },
      plugins: [{
        name: 'seatable-private-preview',
        apply: 'serve',
        enforce: 'post',
        config(projectConfig) {
          return { server: { fs: { deny: [
            ...(projectConfig.server?.fs?.deny || []), '.env', '.env.*', '*.{crt,pem}',
            '**/.git/**', '**/.seatable/**', '**/setting.js',
          ] } } };
        },
        transformIndexHtml: {
          order: 'post',
          handler(html) {
            if (html.includes(browserScript(config))) return html;
            const original = `window.__HTML_PAGE_DEV_CONFIG__ = ${JSON.stringify(config)}`;
            // Normalize the verified template's injection before sending HTML to the browser.
            if (html.includes(original)) return html.replace(original, () => browserScript(config));
            return injectConfig(html, config);
          },
        },
      }],
    });
  } catch {
    process.chdir(previousCwd);
    throw new Error('Cannot start Vite preview. Check the project configuration.');
  }
  const rules = server.config.server.fs.deny;
  if (server.config.server.host !== '127.0.0.1' || !rules.includes('**/.seatable/**') || !rules.includes('**/setting.js')) {
    await server.close();
    process.chdir(previousCwd);
    throw new Error('Vite configuration did not preserve local preview restrictions.');
  }
  try { await server.listen(); }
  catch { await server.close(); process.chdir(previousCwd); throw new Error('Cannot start Vite preview. Check the local port and project configuration.'); }
  return { port: server.httpServer.address().port, close: async () => { await server.close(); process.chdir(previousCwd); } };
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('node preview.mjs --project <project> --mode single|vite [--port 3005] (connects SeaTable; requires explicit consent and completed local settings)');
    return;
  }
  const options = parseOptions(process.argv.slice(2), { project: process.cwd(), mode: '', port: '3005' }, ['project', 'mode', 'port']);
  if (!['single', 'vite'].includes(options.mode)) throw new Error('Pass --mode single or vite, matching the generated project.');
  const port = Number(options.port);
  if (!/^\d+$/.test(options.port) || !Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Port must be an integer from 0 to 65535.');
  const root = projectRoot(options.project);
  const config = loadConfig(root, options.mode);
  const session = await (options.mode === 'single' ? startSinglePreview : startVitePreview)({ root, config, port });
  console.log(`Local SeaTable preview: http://127.0.0.1:${session.port}/`);
  console.log('Browser receives local credentials. Server startup does not prove SeaTable connectivity; no data requests were made by this tool.');
  console.log(`After changing ${options.mode === 'vite' ? 'src/setting.js' : 'setting.js'}, stop and restart preview, then fully refresh the browser. Confirm separately before testing writes to real data.`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await session.close(); process.exit(0); });
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => {
    // Do not dump Vite/HTTP stack traces, which may contain request configuration.
    const known = /^(?:Pass |Port |Project |Unknown |An option|Local credential|Cannot read valid JSON|Local connection|server |appUuid |pageId |accountToken |File |Cannot safely access|deploy-files|A deployment|Single-file|Page source|Cannot load project-local|Vite configuration|Cannot start Vite|Vite uses |(?:src\/)?setting\.js)/;
    console.error(known.test(error.message) ? error.message : 'Cannot start local preview. Check configuration, file permissions, and port availability.');
    process.exitCode = 1;
  });
}
