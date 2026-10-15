#!/usr/bin/env node
/** Normalize a freshly downloaded official template, not an existing user project. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseOptions, projectRoot, assertNoSymlinks, assertConfigPath, assertIgnored, appendIgnoreRules, standaloneConfigSource } from './dev-config.mjs';

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
  assertConfigPath(root);
  const settings = path.join(root, 'setting.js');
  if (fs.existsSync(settings)) {
    if (!fs.statSync(settings).isFile()) throw new Error('Root setting.js must be a regular file; no template files were changed.');
    assertIgnored(root, settings);
  }
  const checkTree = directory => {
    assertNoSymlinks(root, directory);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      assertNoSymlinks(root, file);
      if (entry.name.toLowerCase() === 'setting.js') throw new Error('Fresh template source contains local settings; no template files were changed.');
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
  for (const name of ['vite.config.js', '.gitignore', 'eslint.config.js', 'src/setting.template.js', 'setting.template.js', 'scripts']) {
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
  if (fs.existsSync(ignore)) fs.readFileSync(ignore, 'utf8');
  const lint = path.join(root, 'eslint.config.js');
  let lintText;
  if (fs.existsSync(lint)) {
    lintText = fs.readFileSync(lint, 'utf8');
    if (!lintText.includes("ignores: ['dist', 'node_modules']") ||
        !/import globals from ['"]globals['"]/.test(lintText) || !/\];\s*$/.test(lintText)) {
      throw new Error('Template ESLint config has changed; inspect it before normalization. No files were changed.');
    }
    lintText = lintText.replace("ignores: ['dist', 'node_modules']", "ignores: ['dist', 'node_modules', 'setting.js', 'setting.template.js']");
    lintText = lintText.replace(/\];\s*$/, "  {\n    files: ['vite.config.js', 'scripts/**/*.{js,mjs,cjs}'],\n    languageOptions: { globals: { ...globals.node } },\n  },\n];\n");
  }
  // Remove only the fresh template's known credential log; preserve SDK setup and other logs.
  const app = path.join(esm, 'app.js');
  let appText;
  if (fs.existsSync(app)) {
    appText = fs.readFileSync(app, 'utf8').replace(
      /^[ \t]*if \(options\) \{\r?\n[ \t]*console\.log\((['"])Local settings:\1, options\);\r?\n[ \t]*\}\r?\n/gm, '');
  }
  const viteConfig = fs.readFileSync(path.join(source, 'assets/vite.config.js'), 'utf8')
    .replace('/* __SEATABLE_LOCAL_CONFIG__ */', () => standaloneConfigSource());
  // All path/collision/content checks precede modifications. Fresh templates only.
  for (const name of entries) fs.renameSync(path.join(esm, name), path.join(root, 'src', name));
  fs.rmdirSync(esm);
  if (appText !== undefined) fs.writeFileSync(path.join(root, 'src/app.js'), appText);
  if (fs.existsSync(classic)) fs.rmSync(classic, { recursive: true });
  fs.writeFileSync(path.join(root, 'vite.config.js'), viteConfig);
  fs.copyFileSync(path.join(source, 'assets/setting.template.js'), path.join(root, 'setting.template.js'));
  if (fs.existsSync(path.join(root, 'src/setting.template.js'))) fs.unlinkSync(path.join(root, 'src/setting.template.js'));
  environment.forEach((file, index) => fs.writeFileSync(file, contents[index]));
  appendIgnoreRules(root);
  if (lintText !== undefined) fs.writeFileSync(lint, lintText);
}

/** Merge a fresh template into a config-first project without overwriting user files. */
export function prepareViteFromTemplate(root, template) {
  if (root === template || root.startsWith(`${template}${path.sep}`) || template.startsWith(`${root}${path.sep}`)) {
    throw new Error('Download the fresh template outside the page project.');
  }
  assertConfigPath(root);
  assertConfigPath(template);
  if (fs.existsSync(path.join(template, 'setting.js'))) throw new Error('Use a fresh template without local credentials.');
  if (fs.existsSync(path.join(root, 'setting.js'))) assertIgnored(root, path.join(root, 'setting.js'));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'seatable-vite-template-'));
  const skip = name => ['.git', 'node_modules', 'dist', 'page-zip', '.DS_Store', '__MACOSX', 'Thumbs.db'].includes(name) || name.startsWith('._') || /^[Dd]esktop\.ini$/.test(name);
  try {
    const copy = (from, to) => {
      assertNoSymlinks(template, from);
      const stat = fs.statSync(from);
      if (stat.isDirectory()) {
        fs.mkdirSync(to);
        for (const name of fs.readdirSync(from)) if (!skip(name)) copy(path.join(from, name), path.join(to, name));
      } else if (stat.isFile()) fs.copyFileSync(from, to);
      else throw new Error('Template contains an unsupported file type.');
    };
    for (const name of fs.readdirSync(template)) if (!skip(name)) copy(path.join(template, name), path.join(work, name));
    prepareVite(work);
    const names = fs.readdirSync(work);
    for (const name of names) {
      const file = path.join(root, name);
      assertNoSymlinks(root, file);
      if (fs.existsSync(file) && (name !== '.gitignore' || !fs.statSync(file).isFile())) {
        throw new Error('Template merge would overwrite an existing project path; no project files were changed.');
      }
    }
    const ignore = path.join(root, '.gitignore');
    const existing = fs.existsSync(ignore) ? fs.readFileSync(ignore, 'utf8') : '';
    const missing = fs.readFileSync(path.join(work, '.gitignore'), 'utf8').split(/\r?\n/)
      .filter(line => line && !existing.split(/\r?\n/).includes(line));
    const combined = existing + (missing.length ? `${existing && !existing.endsWith('\n') ? '\n' : ''}${missing.join('\n')}\n` : '');
    // Check the final rule order before touching the target. A template negation
    // must not silently undo an existing credential ignore. The Git index is temporary.
    fs.writeFileSync(path.join(work, '.gitignore'), combined);
    const git = spawnSync('git', ['init', '-q', '--template=', work], { stdio: 'ignore' });
    if (git.status !== 0) throw new Error('Cannot verify merged Git ignore rules; no project files were changed.');
    try {
      for (const name of ['setting.js', 'src/setting.js', '.env.local']) assertIgnored(work, path.join(work, name));
    } catch { throw new Error('Merged ignore rules would expose local credentials; no project files were changed.'); }
    for (const name of names) if (name !== '.gitignore') fs.cpSync(path.join(work, name), path.join(root, name), { recursive: true, errorOnExist: true, force: false });
    if (missing.length) fs.appendFileSync(ignore, combined.slice(existing.length));
    appendIgnoreRules(root);
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.includes('--help')) console.log('node prepare-vite.mjs --project <project> [--template <fresh-template-directory>]');
    else {
      const options = parseOptions(process.argv.slice(2), {}, ['project', 'template']);
      if (!options.project) throw new Error('Pass --project for a fresh template checkout.');
      const root = projectRoot(options.project);
      if (options.template) prepareViteFromTemplate(root, projectRoot(options.template));
      else prepareVite(root);
      console.log('Prepared ESM-only src entrypoints. No credentials, project tests or deployment ZIP were created.');
    }
  } catch (error) {
    console.error(error.code ? 'Cannot safely prepare the fresh template.' : error.message);
    process.exitCode = 1;
  }
}
