# Vite Multi-file Project (Normalized ESM-only Template)

Official source template: https://github.com/seatable/seatable-html-page-template-simple-form

After the shared local configuration completeness check, fetch an accessible current template and record its commit/SDK version. **Do not use the downloaded template unchanged.** Normalize it before implementing business code. This workflow applies to new projects; inspect and preserve existing user projects, and confirm any structural/configuration migration separately.

## Prepare a new project

The official template checked on 2026-10-12 (commit 1d715fa8cec4f6d32de5493dc10617efcfc536a9) selects src/esm versus src/classic with ESM. The Skill deliberately simplifies that structure:

```sh
node <skill-root>/scripts/prepare-vite.mjs --project <configured-project> --template <fresh-template-directory>
```

Download/clone the template into a separate temporary directory, not the configured project (it already contains settings/ignores). The helper normalizes an isolated copy and merges it only after collision and merged-ignore checks. Template ignore negations must not undo credential protection. It preserves root `setting.js` and existing ignore rules, skips template Git/dependency/build/OS files and refuses to overwrite other project paths. Remove the download afterwards. A fresh template without any credential files is required; do not copy a developer's working checkout.

For a fresh template already in the destination, `--template` may be omitted; normalization still preserves root settings. Neither form is an existing customized-project migration tool. It rejects legacy `src/setting.js`, source collisions and previous generated helpers before changing project files. If upstream structure differs, inspect/adapt rather than applying replacements blindly.

- Move all src/esm contents into src, preserving their relative imports/subdirectories. Remove the now-empty esm directory and unused classic demo; new projects support only ESM.
- The helper removes the template's known `Local settings:` console log, which would expose the injected `accountToken`. When adapting initialization code, keep credentials and the full development configuration out of logs; preserve SDK initialization and unrelated diagnostics.
- Remove ESM assignments (true or false) from .env and relevant .env.* files. Preserve port/proxy settings when needed; do not add ESM=true anywhere.
- Let the preparation helper render the dual-mode replacement from assets/vite.config.js and the shared configuration functions in scripts/dev-config.mjs. Fix root to the absolute src directory and envDir to the project root; retain base './', absolute public/dist paths, hashed output names and src aliases. Verify HTML/module/CSS/assets references after flattening.
- Keep local settings parsing/validation, safe HTML injection, configuration reload and private-file restrictions **inside the rendered self-contained vite.config.js**. Edit the shared functions, not a second parser; preparation embeds them without runtime Skill imports. Do not generate/copy dev-config.mjs or vite-dev-plugin.mjs into the page project, and do not import files from the Skill installation. Shared CLI/config utilities remain internal to the Skill. Use command==='serve' plus apply:'serve', not only mode==='development'; even a build with development mode must not read/inject credentials.
- Keep the non-sensitive `setting.template.js` at the project root. Preserve the root `setting.js` created during configuration; never move it into `src/` or create another input. Vite reads it relative to `import.meta.url`, not the process working directory.
- Ensure root `setting.js` is ignored/untracked, excluded from browser imports/public/build artifacts and source lint diagnostics, and denied for direct URLs including `/@fs/` access. Give Node globals only to Vite/config helper files. Update the generated README for configuration-first generation, preview and cancellation; remove ESM-switch/connection-JSON instructions.

Illustrative layout (split business modules only as needed):

```text
project/
  .env                 # optional port/proxy settings, no ESM switch
  .gitignore
  setting.js           # private; configured before generation
  setting.template.js  # non-sensitive example
  package.json
  vite.config.js       # root: src, base: ./, production output: dist
  scripts/             # existing packaging script only; no added dev helpers
  src/
    index.html
    index.js
    index.css
    api.js             # optional shared data layer
```

Follow the shared [generation footprint and validation rules](validation.md#default-generated-project-footprint). The fresh-template helper is not an existing-project migration tool.

## Implement and build

1. Remove demo table names, workflows and unrelated assets; implement the confirmed requirements and data structure. Retain packaging scripts for a later request, without running them during generation.
2. Install the exact SDK version in the shared [SDK version](sdk-version.md) and keep the matching lockfile. Do not upgrade the toolchain wholesale.
3. Establish one shared SDK instance/init and split modules by actual responsibility. Browser modules do not import setting.js; they use the injected development context or production host context.
4. Optionally copy assets/sdk-data.js into src and integrate it:

```js
import { HTMLPageSDK } from 'seatable-html-page-sdk';
import { createDataAccess } from './sdk-data.js';
export const dataAccess = createDataAccess(HTMLPageSDK);
```

Callers use getSdk/listPage/queryPage/loadAll as appropriate and verified. Page-specific API functions accept business inputs, not arbitrary user-entered tables/fields.

5. Run inspected lint and a production build-only command. In the checked template, npm run build is build-only; build-page cleans/builds/packages and is reserved for a later request. Inspect lifecycle hooks/plugins too. Check dist/index.html, relative resources, hashes and absence of credential/mock injection. Builds must work without root setting.js; successful build is not live API verification.

6. Deliver the checked project using the [shared follow-up list](validation.md#delivery-and-follow-up-chat-actions). Preview uses project-local Vite on request, not `dist` or `vite preview`.

If the source cannot be fetched, disclose it. Create an equivalent minimal project only with agreement and do not claim it came from the template.

## Reuse root settings for preview

Follow [Local configuration and preview](local-preview.md) for consent, verification and cancellation. The generated `vite.config.js` owns settings injection, private routes and file restrictions, including standalone `npm run dev`. The Skill runner selects that config explicitly, checks its protection and manages the listener; it adds no second injection plugin and does not change the working directory. Existing projects without this protection need an inspected migration, not silent HTML repair.

Vite reads settings for each HTML response and requests a full browser reload when root `setting.js` changes. Fully reload after connection changes to create a new SDK context, without a separate authentication precheck; ordinary source edits use Vite's normal update behavior. Restart for Vite/server configuration changes when needed, not every page edit. Production builds never read/inject settings; standalone builds and [later packaging](packaging-and-upload.md#vite-project) remain credential-independent.

## Simulation before live preview

Use [SDK-shaped mock data](mock-data.md) after schema confirmation. Load fixed typed response samples through an explicit development-only/temporary entry and the shared parser/business/rendering path; no simulated SDK is needed. Do not ship fixtures or their loading branch, or fall back to fake success on real failures.
