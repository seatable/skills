# Single-file HTML

Use for independent display and simple submission. Place `index.html` at the project root with inline CSS/JS and no npm/Vite requirement. Deployment may include necessary static images; single-file refers to page-code organization, not a ban on assets.

1. Check local configuration completeness using the shared workflow, then generate `index.html` directly from the confirmed requirements, data structure and operations; there is no fixed HTML shell to copy. Choose layout, styling and localized text for the business task.
2. Implement the UI, reads and writes from the confirmed requirements, including loading, empty, validation, success, failure and retry states as applicable.
3. Inline relevant `assets/sdk-data.js` mapping/pagination helpers without export statements when needed; use one dataAccess and its shared SDK initialization as described in the entrypoint.
4. Apply the shared [generation/validation rules](validation.md) and [delivery/follow-up list](validation.md#delivery-and-follow-up-chat-actions). Preview and packaging are separate opt-in actions; implementation-specific behavior is described below.

Follow the shared [SDK version and usage](sdk-version.md) for the pinned CDN URL and global export.

Initialize the SDK once before data operations. Do not expose entire network exceptions in failure messages. SDK initialization alone is not a completed deliverable when the requested business data flow is missing.

For a purely static page, host SDK initialization may remain, but do not create unnecessary data calls.

## Default project layout

```text
project/
  .gitignore            # private/build and OS-file rules
  setting.js            # private; configured before generation
  index.html            # inline page CSS/JS
  assets/               # only when the page actually needs static assets
```

Configuration creates the first two files; generation adds the page and required assets without npm/Vite setup. See the shared [default footprint](validation.md#default-generated-project-footprint).

## Local live preview and later packaging

Read [Local configuration and live preview](local-preview.md). With complete local configuration, a generated page and an explicit preview request, the default lightweight Node.js service temporarily injects four configuration fields into responses without adding Vite/npm or changing index.html. Without deploy-files.json, only index.html is served/packaged. If the page needs extra static resources, create the optional manifest when preview/packaging is requested, listing index.html and those resources individually. The same allowlist controls preview routes and scripts/pack-page.py; configuration files are not public routes. Preview revalidates the allowlist on every request, so changes take effect without restarting; deleting the manifest restores index.html-only serving. Preserve existing manifests; invalid ones return an error until corrected rather than reusing the previous allowlist.

The page must have an explicit head element and initialize the SDK after configuration injection. The server reads and validates root setting.js for each page response. After connection changes, fully reload the browser without a separate authentication precheck; no service restart is needed. Invalid settings return an error instead of reusing old values. If special proxy/development needs exceed the lightweight service, discuss a restricted proxy or an agreed migration to the normalized ESM-only Vite project. Do not automatically change the implementation mode; new Vite projects do not retain a classic/ESM switch.

Use relative asset paths and safe DOM rendering for records. Do not copy unescaped innerHTML concatenation from public examples. Add a new query version when fixed asset URLs change. Do not bypass Base-image display restrictions with a proxy or token.

## Simulation before live preview

For schema-confirmed local simulation, read [SDK-shaped mock data](mock-data.md). Pass fixed typed SDK response samples through the shared parser/business/rendering path; no simulated SDK is needed. Keep sample checks temporary and outside the single-file deliverable; do not ship fixtures or enable simulated writes in production. Real failures must not fall back to mock.
