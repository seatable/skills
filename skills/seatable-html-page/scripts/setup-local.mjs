#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SETTING_FILE, parseOptions, projectRoot, assertNoSymlinks, assertIgnored, assertConfigPath, appendIgnoreRules, hasTrackedSystemFiles, writePrivate } from './dev-config.mjs';

if (process.argv.includes('--help')) {
  console.log('node setup-local.mjs --project <project>');
  process.exit(0);
}
try {
  const options = parseOptions(process.argv.slice(2), { project: process.cwd() }, ['project']);
  const root = projectRoot(options.project);
  assertConfigPath(root);
  appendIgnoreRules(root);
  const name = SETTING_FILE;
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
  if (hasTrackedSystemFiles(root)) console.log('Some OS-generated files are already tracked. Ignore rules do not untrack them; review them manually. No tracked files were removed.');
  console.log('Local development configuration and ignore rules are ready. Existing values were preserved.');
  console.log(`Fill server, appUuid, pageId and accountToken in ${name} locally, then say configuration complete; never paste tokens into chat.`);
} catch (error) {
  console.error(error.code ? 'Cannot safely set up local configuration.' : error.message);
  process.exitCode = 1;
}
