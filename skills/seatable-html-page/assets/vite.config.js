import { defineConfig, loadEnv } from 'vite';
import path, { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import eslint from 'vite-plugin-eslint';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const directory = path.dirname(fileURLToPath(import.meta.url));
// Expanded by prepare-vite.mjs from the shared implementation; not a runtime import.
/* __SEATABLE_LOCAL_CONFIG__ */
const setting = resolve(directory, SETTING_FILE);

function seatableDevPlugin() {
  return {
    name: 'seatable-local-settings',
    apply: 'serve',
    config(projectConfig) {
      return { server: {
        host: '127.0.0.1', cors: false,
        fs: { deny: [...(projectConfig.server?.fs?.deny || []), ...PRIVATE_FILE_DENY] },
      } };
    },
    configureServer(server) {
      loadConfig(directory);
      server.middlewares.use(privateRequestGuard);
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
        const config = loadConfig(directory);
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
      eslint({ cwd: directory, cache: false, lintOnStart: true, emitWarning: true, emitError: true,
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
