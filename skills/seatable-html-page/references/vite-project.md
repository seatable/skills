# Vite Multi-file Project (Normalized ESM-only Template)

Official source template: https://github.com/seatable/seatable-html-page-template-simple-form

Fetch an accessible current template and record its commit/SDK version. **Do not use the downloaded template unchanged.** Normalize it before implementing business code. This workflow applies to new projects; inspect and preserve existing user projects, and confirm any structural/configuration migration separately.

## Prepare a new project

The official template checked on 2026-10-12 (commit 1d715fa8cec4f6d32de5493dc10617efcfc536a9) selects src/esm versus src/classic with ESM. The Skill deliberately simplifies that structure:

```sh
node <skill-root>/scripts/prepare-vite.mjs --project <fresh-template-project>
```

The helper is only for a fresh official simple-form template. It refuses source collisions, previous generated helpers or existing connection files before changing files. If upstream structure differs, inspect/adapt instead of blindly applying replacements or using the old layout.

- Move all src/esm contents into src, preserving their relative imports/subdirectories. Remove the now-empty esm directory and unused classic demo; new projects support only ESM.
- Remove ESM assignments (true or false) from .env and relevant .env.* files. Preserve port/proxy settings when needed; do not add ESM=true anywhere.
- Replace the dual-mode Vite configuration using assets/vite.config.js. Fix root to the absolute src directory and envDir to the project root; retain base './', absolute public/dist paths, hashed output names and src aliases. Verify HTML/module/CSS/assets references after flattening.
- Keep local settings parsing/validation, safe HTML injection, configuration reload and private-file restrictions **inside vite.config.js**, using the self-contained assets/vite.config.js. Do not generate/copy dev-config.mjs or vite-dev-plugin.mjs into the page project, and do not import files from the Skill installation. Shared CLI/config utilities remain internal to the Skill. Use command==='serve' plus apply:'serve', not only mode==='development'; even a build with development mode must not read/inject credentials.
- Keep a non-sensitive src/setting.template.js if useful, but **do not create src/setting.js or root setting.js during generation**. The real settings file is initialized/opened after live-preview consent. It is the only Vite connection source.
- Ensure src/setting.js is ignored/untracked and excluded from browser imports/public/build artifacts and source lint diagnostics. Give Node globals only to Vite/config helper files. Update the generated README to the new structure/workflow; remove instructions to enable ESM or maintain connection JSON.

Illustrative layout (split business modules only as needed):

```text
project/
  .env                 # optional port/proxy settings, no ESM switch
  package.json
  vite.config.js       # root: src, base: ./, production output: dist
  scripts/             # existing packaging script only; no added dev helpers
  src/
    index.html
    index.js
    index.css
    api.js             # optional shared data layer
    setting.template.js
    setting.js         # private; only after live-preview consent
```

Follow the shared [generation footprint/screenshot rules](validation.md#default-generated-project-footprint): preparation/generation creates no tests, manifest, captures, private connection files or deployment ZIPs. Preserve existing user files; the fresh-template helper is not an existing-project migration tool.

## Implement and build

1. Remove demo table names, workflows and unrelated assets; implement the confirmed requirements and data structure. Do not scaffold tests or copy Skill tests. Retain packaging scripts for a later request, without running them during generation.
2. Install the exact SDK version in the shared [SDK version](sdk-version.md) and keep the matching lockfile. Do not upgrade the toolchain wholesale.
3. Establish one shared SDK instance/init and split modules by actual responsibility. Browser modules do not import setting.js; they use the injected development context or production host context.
4. Optionally copy assets/sdk-data.js into src and integrate it:

```js
import { HTMLPageSDK } from 'seatable-html-page-sdk';
import { createDataAccess } from './sdk-data.js';
export const dataAccess = createDataAccess(HTMLPageSDK);
```

Callers use getSdk/listPage/queryPage/loadAll as appropriate and verified. Page-specific API functions accept business inputs, not arbitrary user-entered tables/fields.

5. Run inspected lint and a production build-only command. In the checked template, npm run build is build-only; build-page cleans/builds/packages and is reserved for a later request. Inspect lifecycle hooks/plugins too. Check dist/index.html, relative resources, hashes and absence of credential/mock injection. Builds must work without src/setting.js; successful build is not live API verification.

6. After the checked build, use the shared delivery/follow-up list below; do not start a service or create private settings automatically. For data-integrated pages, offer only [preview after connecting SeaTable](local-preview.md). After consent/settings completion, reuse project-local Vite for connected development and verify a small authorized read. Do not serve dist or start an unconnected local preview as an alternative. Purely static pages need no connection/preview hint.

If the source cannot be fetched, disclose it. Create an equivalent minimal project only with agreement and do not claim it came from the template.

## Connect only after consent

Follow [Local preview](local-preview.md). Initialize with setup-local --mode vite if missing, then **open src/setting.js** for the user to fill server/appUuid/pageId/accountToken locally. Preserve existing edits. Do not create a connection JSON or regenerate settings at startup. Static string values keep validation/token scanning non-executing; do not use process.env expressions or imports in settings.

The inline development plugin in vite.config.js handles npm run dev; the Skill preview tool uses project-local Vite with additional local-only safeguards. Production builds never read/inject settings. Restart/refresh after changing the page connection. Initial live verification is read-only; mutations need separate authorization.

Generation/build/later packaging remain credential-independent. Use the shared [delivery/follow-up list](validation.md#delivery-and-follow-up-chat-actions); on a later [packaging request](packaging-and-upload.md#vite-project), create/check the actual ZIP. The checker's --project reads a present src/setting.js without executing it for known-token scanning.

## Simulation before live preview

Use [SDK-shaped mock data](mock-data.md) after schema confirmation. Load fixed typed response samples through an explicit development-only/temporary entry and the shared parser/business/rendering path; no simulated SDK is needed. Do not ship fixtures or their loading branch, or fall back to fake success on real failures. Simulation needs no settings file, extra JSON, generated tests or ZIP.
