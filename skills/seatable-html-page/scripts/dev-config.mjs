/** Shared local configuration mechanics. Never log parsed values or raw errors. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const SINGLE_SETTING_FILE = 'setting.js';
export const VITE_SETTING_FILE = 'src/setting.js';
const CONFIG_KEYS = ['server', 'appUuid', 'pageId', 'accountToken'];

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

/** Reject wrong-mode inputs before setup mutates ignores or reads credentials. */
export function assertConfigMode(root, mode) {
  if (!['single', 'vite'].includes(mode)) throw new Error('Configuration mode must be single or vite.');
  for (const name of [SINGLE_SETTING_FILE, VITE_SETTING_FILE]) assertNoSymlinks(root, path.join(root, name));
  const other = mode === 'vite' ? SINGLE_SETTING_FILE : VITE_SETTING_FILE;
  if (fs.existsSync(path.join(root, other))) {
    throw new Error(mode === 'vite'
      ? 'Vite uses src/setting.js. Keep only that mode-specific configuration; root setting.js is not supported in Vite mode.'
      : 'Single-file uses root setting.js. Keep only that mode-specific configuration; src/setting.js is not supported in single-file mode.');
  }
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

export function loadConfig(root, mode = 'single') {
  assertConfigMode(root, mode);
  const name = mode === 'vite' ? VITE_SETTING_FILE : SINGLE_SETTING_FILE;
  const file = path.join(root, name);
  assertNoSymlinks(root, file);
  assertIgnored(root, file);
  if (!fs.existsSync(file)) throw new Error(`Local connection file is missing. Run setup-local.mjs --mode ${mode}, then fill ${name} locally.`);
  let source;
  try {
    source = fs.readFileSync(file, 'utf8');
  } catch {
    throw new Error(`Cannot read ${name}. Contents were not displayed.`);
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
