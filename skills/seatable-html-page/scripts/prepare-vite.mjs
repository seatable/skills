#!/usr/bin/env node
/** Normalize a freshly downloaded official template, not an existing user project. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseOptions, projectRoot, assertNoSymlinks } from './dev-config.mjs';

export function prepareVite(root) {
  const esm = path.join(root, 'src/esm');
  const source = fileURLToPath(new URL('..', import.meta.url));
  const packageFile = path.join(root, 'package.json');
  assertNoSymlinks(root, packageFile);
  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8')); }
  catch { throw new Error('Cannot read template package.json.'); }
  if (pkg.name !== 'seatable-html-page-template-simple-form' || pkg.type !== 'module' ||
      !fs.existsSync(path.join(esm, 'index.html'))) {
    throw new Error('Prepare only a fresh official ESM template; existing/custom projects need an inspected migration.');
  }
  for (const name of ['src/setting.js', 'setting.js']) {
    const file = path.join(root, name);
    assertNoSymlinks(root, file);
    if (fs.existsSync(file)) throw new Error('Existing connection configuration detected; no template files were changed.');
  }
  const checkTree = directory => {
    assertNoSymlinks(root, directory);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      assertNoSymlinks(root, file);
      if (entry.isDirectory()) checkTree(file);
    }
  };
  checkTree(esm);
  const classic = path.join(root, 'src/classic');
  assertNoSymlinks(root, classic);
  if (fs.existsSync(classic)) checkTree(classic);
  const entries = fs.readdirSync(esm);
  for (const name of entries) {
    const destination = path.join(root, 'src', name);
    assertNoSymlinks(root, destination);
    if (fs.existsSync(destination)) throw new Error('Flattening would overwrite a source file; no template files were changed.');
  }
  for (const name of ['vite.config.js', '.gitignore', 'eslint.config.js', 'src/setting.template.js', 'scripts']) {
    const file = path.join(root, name);
    assertNoSymlinks(root, file);
    if (fs.existsSync(file) && (name === 'scripts' ? !fs.statSync(file).isDirectory() : !fs.statSync(file).isFile())) {
      throw new Error('Template output paths have unexpected file types; no template files were changed.');
    }
  }
  // Do not carry the previous generated helpers into a fresh project.
  for (const name of ['dev-config.mjs', 'vite-dev-plugin.mjs']) {
    const file = path.join(root, 'scripts', name);
    assertNoSymlinks(root, file);
    if (fs.existsSync(file)) throw new Error('Existing generated helper detected; inspect the project before normalization. No files were changed.');
  }
  const environment = fs.readdirSync(root).filter(name => /^\.env(?:\.|$)/.test(name)).map(name => path.join(root, name));
  const contents = environment.map(file => {
    assertNoSymlinks(root, file);
    if (!fs.statSync(file).isFile()) throw new Error('Template environment paths must be regular files.');
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(line => !/^\s*(?:export\s+)?ESM\s*=/.test(line)).join('\n');
  });
  const ignore = path.join(root, '.gitignore');
  const ignored = fs.existsSync(ignore) ? fs.readFileSync(ignore, 'utf8') : '';
  const lint = path.join(root, 'eslint.config.js');
  let lintText;
  if (fs.existsSync(lint)) {
    lintText = fs.readFileSync(lint, 'utf8');
    if (!lintText.includes("ignores: ['dist', 'node_modules']") ||
        !/import globals from ['"]globals['"]/.test(lintText) || !/\];\s*$/.test(lintText)) {
      throw new Error('Template ESLint config has changed; inspect it before normalization. No files were changed.');
    }
    lintText = lintText.replace("ignores: ['dist', 'node_modules']", "ignores: ['dist', 'node_modules', 'src/setting.js', 'src/setting.template.js']");
    lintText = lintText.replace(/\];\s*$/, "  {\n    files: ['vite.config.js', 'scripts/**/*.{js,mjs,cjs}'],\n    languageOptions: { globals: { ...globals.node } },\n  },\n];\n");
  }
  // All path/collision/content checks precede modifications. Fresh templates only.
  for (const name of entries) fs.renameSync(path.join(esm, name), path.join(root, 'src', name));
  fs.rmdirSync(esm);
  if (fs.existsSync(classic)) fs.rmSync(classic, { recursive: true });
  fs.copyFileSync(path.join(source, 'assets/vite.config.js'), path.join(root, 'vite.config.js'));
  fs.copyFileSync(path.join(source, 'assets/setting.template.js'), path.join(root, 'src/setting.template.js'));
  environment.forEach((file, index) => fs.writeFileSync(file, contents[index]));
  const rules = ['/src/setting.js', '/.env.local', '/dist/', '/page-zip/'];
  const missing = rules.filter(rule => !ignored.split(/\r?\n/).includes(rule));
  if (missing.length) fs.appendFileSync(ignore, `${ignored && !ignored.endsWith('\n') ? '\n' : ''}${missing.join('\n')}\n`);
  if (lintText !== undefined) fs.writeFileSync(lint, lintText);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.includes('--help')) console.log('node prepare-vite.mjs --project <fresh-template-project>');
    else {
      const options = parseOptions(process.argv.slice(2), {}, ['project']);
      if (!options.project) throw new Error('Pass --project for a fresh template checkout.');
      prepareVite(projectRoot(options.project));
      console.log('Prepared ESM-only src entrypoints. No credentials, project tests or deployment ZIP were created.');
    }
  } catch (error) {
    console.error(error.code ? 'Cannot safely prepare the fresh template.' : error.message);
    process.exitCode = 1;
  }
}
