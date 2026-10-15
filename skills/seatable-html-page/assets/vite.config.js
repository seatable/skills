import { defineConfig, loadEnv } from 'vite';
import path, { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import eslint from 'vite-plugin-eslint';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const directory = path.dirname(fileURLToPath(import.meta.url));
const setting = resolve(directory, 'src/setting.js');
const CONFIG_KEYS = ['server', 'appUuid', 'pageId', 'accountToken'];

function required(value, label) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || ['\r', '\n', '\0'].some(char => value.includes(char)) ||
      /^(?:<.*>|\$\{.*\}|(?:YOUR|REPLACE|TODO|CHANGEME)(?:[_ -].*)?)$/i.test(value)) {
    throw new Error(`${label} must be a non-empty value, not a placeholder; do not paste credentials into chat.`);
  }
  return value;
}

function validateConfig(config) {
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

/** Parse a static ESM default object without importing/executing local code.
 * Permit literal strings, ordinary JS keys, comments and trailing commas only.
 */
function parseSetting(source) {
  const lexer = /\s+|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|[A-Za-z_$][\w$]*|[{}:;,]/gy;
  const tokens = [];
  let offset = 0;
  const fail = () => {
    throw new Error('src/setting.js must export a static default object containing only the four connection strings; no imports or executable expressions. Contents were not displayed.');
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

// Only the serve plugin calls this. Never execute the user's settings module.
function assertLocalPath(file) {
  for (let current = file; current !== directory; current = path.dirname(current)) {
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Symbolic link');
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error('Cannot safely read local configuration; check symbolic links and permissions.');
    }
  }
}

function loadLocalSettings() {
  const singleSetting = resolve(directory, 'setting.js');
  assertLocalPath(singleSetting);
  if (fs.existsSync(singleSetting)) throw new Error('Vite uses src/setting.js. Keep only that mode-specific configuration; root setting.js is not supported in Vite mode.');
  assertLocalPath(setting);
  if (!fs.existsSync(setting)) return null;
  const git = args => spawnSync('git', ['-C', directory, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const repository = git(['rev-parse', '--is-inside-work-tree']);
  if (repository.status === 0 && repository.stdout.trim() === 'true') {
    if (git(['check-ignore', '-q', '--', 'src/setting.js']).status !== 0 ||
        git(['ls-files', '--error-unmatch', '--', 'src/setting.js']).status === 0) {
      throw new Error('Local credential files must be Git-ignored and untracked before preview.');
    }
  }
  let source;
  try {
    if (!fs.statSync(setting).isFile()) throw new Error('Not a regular file');
    source = fs.readFileSync(setting, 'utf8');
  } catch {
    throw new Error('Cannot read src/setting.js. Contents were not displayed.');
  }
  return validateConfig(parseSetting(source));
}

function browserScript(config) {
  // JSON alone is unsafe in an inline <script>: escape HTML delimiters and JS line separators.
  const json = JSON.stringify(config).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `window.__HTML_PAGE_DEV_CONFIG__ = Object.freeze(${json});`;
}

function seatableDevPlugin() {
  return {
    name: 'seatable-local-settings',
    apply: 'serve',
    config(projectConfig) {
      return { server: {
        host: '127.0.0.1', cors: false,
        fs: { deny: [...(projectConfig.server?.fs?.deny || []), '.env', '.env.*', '*.{crt,pem}',
          '**/.git/**', '**/.seatable/**', '**/setting.js'] },
      } };
    },
    configureServer(server) {
      server.watcher.add(setting);
    },
    handleHotUpdate({ file, server }) {
      if (file === setting) {
        server.ws.send({ type: 'full-reload', path: '*' });
        return [];
      }
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        // A disconnected generated project does not require a credential file.
        const config = loadLocalSettings();
        if (!config) return html;
        if (!/<head\b[^>]*>/i.test(html) || /__HTML_PAGE_DEV_CONFIG__\s*=(?!=)/.test(html)) {
          throw new Error('Local settings injection needs one head and no existing SDK configuration.');
        }
        return html.replace(/<head\b[^>]*>/i, head => `${head}\n<script>${browserScript(config)}</script>`);
      },
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, directory, '');
  return {
    base: './',
    root: resolve(directory, 'src'),
    envDir: directory,
    publicDir: resolve(directory, 'public'),
    build: {
      outDir: resolve(directory, 'dist'),
      emptyOutDir: true,
      rollupOptions: {
        output: {
          entryFileNames: '[name]-[hash].js',
          chunkFileNames: '[name]-[hash].js',
          assetFileNames: asset => asset.names?.[0]?.endsWith('.css')
            ? '[name]-[hash][extname]' : 'assets/[name]-[hash][extname]',
        },
      },
      assetsInlineLimit: 4 * 1024,
      chunkSizeWarningLimit: 1000,
    },
    plugins: [
      command === 'serve' && seatableDevPlugin(),
      eslint({ cache: false, lintOnStart: true, emitWarning: true, emitError: true,
        failOnError: false, include: ['src/**/*.{js,ts,vue,jsx,tsx}'],
        exclude: ['**/setting.js', '**/setting.template.js', 'node_modules/**'] }),
    ].filter(Boolean),
    server: {
      host: '127.0.0.1',
      port: Number(env.VITE_DEV_PORT) || 3005,
      proxy: env.PROXY_PATH && env.PROXY_TARGET ? {
        [env.PROXY_PATH]: { target: env.PROXY_TARGET, changeOrigin: true },
      } : {},
    },
    resolve: {
      alias: {
        '@': resolve(directory, 'src'),
        '@components': resolve(directory, 'src/components'),
        '@constants': resolve(directory, 'src/constants'),
        '@utils': resolve(directory, 'src/utils'),
      },
    },
  };
});
