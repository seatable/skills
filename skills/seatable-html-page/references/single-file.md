# Single-file HTML

Use for independent display and simple submission. Place `index.html` at the project root with inline CSS/JS and no npm/Vite requirement. Deployment may include necessary static images; single-file refers to page-code organization, not a ban on assets.

1. Generate `index.html` directly from the confirmed requirements, data structure and operations; there is no fixed HTML shell to copy. Choose layout, styling and localized text for the business task.
2. Implement the UI, reads and writes from the confirmed requirements, including loading, empty, validation, success, failure and retry states as applicable.
3. Inline relevant `assets/sdk-data.js` mapping/pagination helpers without export statements when needed; use one dataAccess and its shared SDK initialization as described in the entrypoint.
4. Do not start a service automatically after generation. For data-integrated pages, offer only [preview after connecting SeaTable](local-preview.md) through the shared follow-up list. Start it after explicit connection consent and local configuration, then verify a small authorized read. Do not offer or start an unconnected local preview. Purely static pages need no connection/preview hint. Production acceptance remains inside Universal App without a development API token.
5. Follow the shared [generation footprint/screenshot rules](validation.md#default-generated-project-footprint) and [delivery/follow-up list](validation.md#delivery-and-follow-up-chat-actions). A self-contained index.html needs no manifest; only extra relative assets need an optional explicit allowlist at later preview/packaging time.

Follow the shared [SDK version and usage](sdk-version.md) for the pinned CDN URL and global export.

Initialize the SDK once before data operations. Do not expose entire network exceptions in failure messages. SDK initialization alone is not a completed deliverable when the requested business data flow is missing.

For a purely static page, host SDK initialization may remain, but do not create unnecessary data calls.

## Local live preview and later packaging

Read [Local configuration and live preview](local-preview.md). After real-data preview consent and local completion of the static root setting.js, the default lightweight Node.js service temporarily injects four configuration fields into responses without adding Vite/npm or changing index.html. Without deploy-files.json, only index.html is served/packaged. If the page needs extra static resources, create the optional manifest when preview/packaging is requested, listing index.html and those resources individually. The same allowlist controls preview routes and scripts/pack-page.py; configuration files are not public routes. Keep any existing manifest, and stop for an invalid one rather than ignoring it.

The page must have an explicit head element and initialize the SDK after configuration injection. Generation and later packaging need no token; preview requires completed local connection settings and consent. Preview does not create a deployment ZIP. If special proxy/development needs exceed the lightweight service, discuss a restricted proxy or an agreed migration to the normalized ESM-only Vite project. Do not automatically change the implementation mode; new Vite projects do not retain a classic/ESM switch.

Use relative asset paths and safe DOM rendering for records. Do not copy unescaped innerHTML concatenation from public examples. Add a new query version when fixed asset URLs change. Do not bypass Base-image display restrictions with a proxy or token.

## Simulation before live preview

For schema-confirmed local simulation, read [SDK-shaped mock data](mock-data.md). Pass fixed typed SDK response samples through the shared parser/business/rendering path; no simulated SDK is needed. Keep sample checks temporary and outside the single-file deliverable; do not ship fixtures or enable simulated writes in production. No credentials, extra mock JSON, generated tests or deployment ZIP are required for this validation. Real failures must not fall back to mock.
