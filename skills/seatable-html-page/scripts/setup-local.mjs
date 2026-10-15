#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SINGLE_SETTING_FILE, VITE_SETTING_FILE, parseOptions, projectRoot, assertNoSymlinks, assertIgnored, assertConfigMode, writePrivate } from './dev-config.mjs';

if (process.argv.includes('--help')) {
  console.log('node setup-local.mjs --project <project> [--mode single|vite]');
  process.exit(0);
}
try {
  const options = parseOptions(process.argv.slice(2), { project: process.cwd(), mode: 'single' }, ['project', 'mode']);
  if (!['single', 'vite'].includes(options.mode)) throw new Error('--mode must be single or vite.');
  const root = projectRoot(options.project);
  assertConfigMode(root, options.mode);
  const ignore = path.join(root, '.gitignore');
  assertNoSymlinks(root, ignore);
  const existing = fs.existsSync(ignore) ? fs.readFileSync(ignore, 'utf8') : '';
  const rules = ['/setting.js', '/src/setting.js', '/.env.local', '/dist/', '/page-zip/'];
  const missing = rules.filter(rule => !existing.split(/\r?\n/).includes(rule));
  if (missing.length) fs.appendFileSync(ignore, `${existing && !existing.endsWith('\n') ? '\n' : ''}# SeaTable local preview (never deploy credentials)\n${missing.join('\n')}\n`);
  const name = options.mode === 'vite' ? VITE_SETTING_FILE : SINGLE_SETTING_FILE;
  const file = path.join(root, name);
  assertNoSymlinks(root, file);
  assertIgnored(root, file);
  if (!fs.existsSync(file)) {
    const sample = fs.readFileSync(fileURLToPath(new URL('../assets/setting.template.js', import.meta.url)), 'utf8');
    writePrivate(root, file, sample);
  } else {
    if (!fs.statSync(file).isFile()) throw new Error('Local connection configuration must be a regular file.');
    fs.chmodSync(file, 0o600);
  }
  console.log('Local connection file and ignore rules are ready. Existing values were preserved.');
  console.log(`Fill server, appUuid, pageId and accountToken in ${name} locally; never paste tokens into chat.`);
} catch (error) {
  console.error(error.code ? 'Cannot safely set up local configuration.' : error.message);
  process.exitCode = 1;
}
