/** Shared local configuration mechanics. Never log parsed values or raw errors. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const SETTING_FILE = 'setting.js';
export const LOCAL_IGNORE_RULES = [
  '/setting.js', '/src/setting.js', '/.env.local', '/dist/', '/page-zip/',
];
export const OS_IGNORE_RULES = ['.DS_Store', '._*', '__MACOSX/', 'Thumbs.db', '[Dd]esktop.ini'];
const CONFIG_KEYS = ['server', 'appUuid', 'pageId', 'accountToken'];
export const PRIVATE_FILE_DENY = ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.seatable/**', '**/setting.js'];

export function projectRoot(value = process.cwd()) {
  try {
    const root = fs.realpathSync(path.resolve(value));
    if (!fs.statSync(root).isDirectory()) throw new Error();
    return root;
  } catch {
    throw new Error('Project directory must exist.');
  }
}

export function parseOptions(argv, defaults, allowed) {
  const options = { ...defaults };
  for (let index = 0; index < argv.length; index += 2) {
    const arg = argv[index];
    if (!arg?.startsWith('--') || !allowed.includes(arg.slice(2))) {
      throw new Error('Unknown option. Use --help for supported options.');
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error('An option is missing its value.');
    options[arg.slice(2)] = value;
  }
  return options;
}

export function inside(root, file) {
  const relative = path.relative(root, file);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('File must stay inside the project.');
  }
  return relative;
}

export function assertNoSymlinks(root, file) {
  inside(root, file);
  for (let current = file; current !== root; current = path.dirname(current)) {
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Project files cannot pass through symbolic links.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error('Cannot safely access project file; check symbolic links and permissions.');
    }
  }
}

export function assertIgnored(root, file) {
  const relative = inside(root, file);
  const git = spawnSync('git', ['-C', root, 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  if (git.status !== 0 || git.stdout.trim() !== 'true') return;
  const ignored = spawnSync('git', ['-C', root, 'check-ignore', '-q', '--', relative], { stdio: 'ignore' });
  const tracked = spawnSync('git', ['-C', root, 'ls-files', '--error-unmatch', '--', relative], { stdio: 'ignore' });
  if (ignored.status !== 0 || tracked.status === 0) {
    throw new Error('Local credential files must be Git-ignored and untracked before preview or generation.');
  }
}

/** Ignore rules do not remove already tracked OS files. Do not alter the index. */
export function hasTrackedSystemFiles(root) {
  const result = spawnSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return result.status === 0 && result.stdout.split('\0').some(file => file.split('/').some(name =>
    ['.DS_Store', '__MACOSX', 'Thumbs.db'].includes(name) || name.startsWith('._') || /^[Dd]esktop\.ini$/.test(name)));
}

function required(value, label) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || ['\r', '\n', '\0'].some(char => value.includes(char)) ||
      /^(?:<.*>|\$\{.*\}|(?:YOUR|REPLACE|TODO|CHANGEME)(?:[_ -].*)?)$/i.test(value)) {
    throw new Error(`${label} must be a non-empty value, not a placeholder; do not paste credentials into chat.`);
  }
  return value;
}

export function validateConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config) ||
      Object.keys(config).some(key => !CONFIG_KEYS.includes(key))) {
    throw new Error('Local connection configuration must be a flat object with only server, appUuid, pageId and accountToken.');
  }
  for (const key of CONFIG_KEYS) required(config[key], key);
  let url;
  try {
    url = new URL(config.server);
  } catch {
    throw new Error('server must be a valid HTTP/HTTPS URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw new Error('server must be HTTP/HTTPS with no embedded credentials, query or fragment. Preserve the development-info path.');
  }
  return config;
}

/** Reject legacy or ambiguous inputs before modifying the project. */
export function assertConfigPath(root) {
  for (const name of [SETTING_FILE, 'src/setting.js']) assertNoSymlinks(root, path.join(root, name));
  if (fs.existsSync(path.join(root, 'src/setting.js'))) {
    throw new Error('Legacy src/setting.js found. Migrate it explicitly to root setting.js and remove the legacy input before continuing; no credentials were copied.');
  }
}

/** Append only missing rules, preserving user rules and files. */
export function appendIgnoreRules(root) {
  const file = path.join(root, '.gitignore');
  assertNoSymlinks(root, file);
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const lines = existing.split(/\r?\n/);
  let additions = '';
  for (const [label, rules] of [['SeaTable local development (never deploy credentials)', LOCAL_IGNORE_RULES], ['OS-generated files', OS_IGNORE_RULES]]) {
    const missing = rules.filter(rule => !lines.includes(rule));
    if (missing.length) additions += `# ${label}\n${missing.join('\n')}\n`;
  }
  if (additions) fs.appendFileSync(file, `${existing && !existing.endsWith('\n') ? '\n' : ''}${additions}`);
}

/** Parse a static ESM default object without importing/executing local code.
 * Permit literal strings, ordinary JS keys, comments and trailing commas only.
 */
export function parseSetting(source) {
  const lexer = /\s+|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|[A-Za-z_$][\w$]*|[{}:;,]/gy;
  const tokens = [];
  let offset = 0;
  const fail = () => {
    throw new Error('setting.js must export a static default object containing only the four connection strings; no imports or executable expressions. Contents were not displayed.');
  };
  while (offset < source.length) {
    lexer.lastIndex = offset;
    const match = lexer.exec(source);
    if (!match) return fail();
    offset = lexer.lastIndex;
    if (!/^\s|^\//.test(match[0])) tokens.push(match[0]);
  }
  let index = 0;
  const expect = token => {
    if (tokens[index++] !== token) fail();
  };
  const string = token => {
    if (!token || !['"', '\''].includes(token[0])) return fail();
    try {
      if (token[0] === '"') return JSON.parse(token);
      const body = token.slice(1, -1).replace(/\\[\s\S]|"/g, value => value === '\\\'' ? '\'' : value === '"' ? '\\"' : value);
      return JSON.parse(`"${body}"`);
    } catch {
      return fail();
    }
  };
  expect('export'); expect('default'); expect('{');
  const config = {};
  while (tokens[index] !== '}') {
    const token = tokens[index++];
    const key = token && /^[A-Za-z_$][\w$]*$/.test(token) ? token : string(token);
    if (!CONFIG_KEYS.includes(key) || Object.hasOwn(config, key)) fail();
    expect(':'); config[key] = string(tokens[index++]);
    if (tokens[index] === '}') break;
    expect(',');
  }
  expect('}');
  if (tokens[index] === ';') index++;
  if (index !== tokens.length || Object.keys(config).length !== CONFIG_KEYS.length) fail();
  return config;
}

export function loadConfig(root) {
  assertConfigPath(root);
  const file = path.join(root, SETTING_FILE);
  assertIgnored(root, file);
  if (!fs.existsSync(file)) throw new Error('Local connection file is missing. Run setup-local.mjs, fill root setting.js locally, then confirm configuration complete.');
  let source;
  try {
    if (!fs.statSync(file).isFile()) throw new Error();
    source = fs.readFileSync(file, 'utf8');
  } catch {
    throw new Error('Cannot read setting.js. Contents were not displayed.');
  }
  return validateConfig(parseSetting(source));
}

export function writePrivate(root, file, content) {
  assertNoSymlinks(root, file);
  assertIgnored(root, file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Restrict existing files before truncation as well as newly created files.
  if (fs.existsSync(file)) fs.chmodSync(file, 0o600);
  const descriptor = fs.openSync(file, 'w', 0o600);
  try {
    fs.fchmodSync(descriptor, 0o600); fs.writeFileSync(descriptor, content);
  } finally {
    fs.closeSync(descriptor);
  }
}

export function browserScript(config) {
  // JSON alone is unsafe in an inline <script>: escape HTML delimiters and JS line separators.
  const json = JSON.stringify(config).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `window.__HTML_PAGE_DEV_CONFIG__ = Object.freeze(${json});`;
}

/** Block private URLs before Vite's SPA fallback can return injected HTML. */
export function privateRequestGuard(request, response, next) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/\\/g, '/'); }
  catch { response.writeHead(400); response.end('Invalid path.'); return; }
  const blocked = pathname.toLowerCase().split('/').some(part =>
    ['setting.js', 'setting.template.js', '.git', '.gitignore', '.seatable'].includes(part) || /^\.env(?:\.|$)/.test(part));
  if (!blocked) { next(); return; }
  response.writeHead(404, { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain' });
  response.end('Not found.');
}

/** Embed the same static config mechanics in a self-contained project config.
 * The template supplies fs, path and spawnSync; no Skill imports are emitted.
 */
export function standaloneConfigSource() {
  return [
    `const SETTING_FILE = ${JSON.stringify(SETTING_FILE)};`,
    `const CONFIG_KEYS = ${JSON.stringify(CONFIG_KEYS)};`,
    `const PRIVATE_FILE_DENY = ${JSON.stringify(PRIVATE_FILE_DENY)};`,
    ...[inside, assertNoSymlinks, assertIgnored, required, validateConfig,
      assertConfigPath, parseSetting, loadConfig, browserScript, privateRequestGuard]
      .map(fn => fn.toString()),
  ].join('\n\n');
}
