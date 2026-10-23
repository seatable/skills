---
name: seatable-html-page
description: Create or modify SeaTable Universal App HTML pages from business requirements and confirmed tables, fields, types, and relationships, or package an existing page project into an upload-ready ZIP on request. Choose a single HTML file or a Vite multi-file project, integrate seatable-html-page-sdk, select verified APIs, and configure local development before generation with server/appUuid/pageId/accountToken for live-data preview. Use for SeaTable custom forms, data lists, dashboards, and business tools, not ordinary websites, direct REST integrations, or automatic Base schema changes.
---

# SeaTable HTML Page

Create Universal App HTML pages with confirmed data structures and verified `seatable-html-page-sdk` APIs. Use the user's conversation language for responses, page text and follow-up action labels/instructions, adapting English examples accordingly; preserve exact table names, field names, option values and technical identifiers. Keep the accountToken menu path in English exactly as documented in [Local configuration](references/local-preview.md); do not translate its labels.

## Route the request

- **Configure local development / configuration complete:** follow [Local configuration](references/local-preview.md). Initialize root `setting.js` and ignore rules, open it for local editing, then verify the basic connection only after completion. Do not generate a page or start preview unless also requested.
- **Generate or modify:** follow the workflow below. Inspect an existing project's structure, versions and scripts first; preserve user files, tests and artifacts. Confirm structural migrations separately.
- **Preview page:** follow [Connected preview](references/local-preview.md#start-preview-on-request). Reuse the project and complete root settings without repeating authentication verification, explain real-data access and confirm any unknown read scope. No ordinary unconnected preview or repeated setup after completed configuration. Purely static pages need no preview suggestion.
- **Cancel preview:** follow [Stop the preview service](references/local-preview.md#stop-the-preview-service). Stop only the current project's identified preview session, verify shutdown and preserve source/local settings; no reconnection or regeneration is needed.
- **Package an existing page:** follow [Packaging and upload](references/packaging-and-upload.md) directly. No regeneration, repeated schema questions, credentials or preview prerequisite. Create/check the actual ZIP and return its absolute path with a short upload hint, without a follow-up action list. Leave any running preview unchanged unless cancellation was also requested.

For configuration, generation, preview, cancellation or packaging, resolve the project from conversation/workspace; ask for its path only if ambiguous or unavailable. Do not treat the Skill folder as the page project. Packaging or preview does not authorize upload, permission changes or real-data writes.

## 0. Require local development configuration

Before generating or modifying page code, check once that root `setting.js` is present, complete and safe to read, using `scripts/verify-local.mjs --project <project> --check-only`. This is a local check, not another authentication request or a search for proof of earlier verification. If configuration is missing/incomplete, directly enter the [configuration workflow](references/local-preview.md): initialize/preserve settings and ignores, open the file, wait for completion, and verify the basic connection once before resuming the original request. Do not require a separate setup request or generate source, download a template or install dependencies while configuration is incomplete. Never request or print tokens/file contents, persist a configured flag, or silently migrate legacy settings.

Basic authentication belongs to configuration completion, not every generation or preview request, and verifies neither `pageId` nor table access. Configuration alone generates no page and starts no preview; resume an already requested action only after its prerequisites are met. Packaging, cancellation, standalone builds and design-only discussion do not require it.

## 1. Confirm data structure and operations

Establish the page goals/interactions first, then confirm only the needed schema: exact table/field names, types and writable fields, select values, link owners/targets/cardinality/display fields, record selection, display/filter/sort/calculation/write scope and relevant data-volume limits. Confirm date formats/timezones and numeric units/precision where they affect implementation. Runtime record IDs come from selected/created rows; do not ask for every ID in advance. Generation needs no platform permission configuration or proof of access; unknown access is not missing schema or evidence of denial. State required operations and respect explicitly known restrictions; actual authorization is enforced by SeaTable and verified only during authorized live checks.

**Collect missing implementation-relevant names, types or relationships into one clarification request before writing data calls.** Business labels are not field names. Reuse confirmed/authorized context without asking again, but do not claim verification without evidence. Never inspect a Base proactively when reading is not authorized. With unknown schema, offer a design; generate a disconnected prototype only if explicitly requested and label it as not integrated. Purely static pages need no irrelevant schema. Use disclosed, reasonable defaults for noncritical volume, ordering and styling choices rather than blocking on them. User-supplied schema supports generation; authorized metadata can confirm structure, not effective permissions; live results prove only the operations actually exercised.

Apply the confirmed structure and operations directly to code and SDK-shaped mock data; neither mode generates `data-contract.json`, a substitute schema file or a temporary validation file by default. If the user requests data-structure documentation, describe the confirmed tables, fields, relationships and operations in ordinary prose/tables or the requested format, without a Skill-specific contract schema or checker. Keep tokens, real row data and local connection details out of that documentation. Preserve existing user documents and resolve conflicts with confirmed requirements before relying on them; their absence does not block generation, preview or packaging. Generation follows the configuration prerequisite above; packaging needs no credentials.

## 2. Select the mode and implement

Choose by maintainable business complexity, not table count, code length or link-field presence. Respect a requested mode; explain and confirm migration if it becomes impractical.

| Mode | Use when | Required reference |
| --- | --- | --- |
| Single-file HTML | Independent display/simple submission, limited state, no build-only dependency | [Single-file implementation](references/single-file.md) |
| Vite multi-file | Coordinated filters/calculations, conditional or multi-step workflows, complex state, reusable modules or npm dependencies | [Vite implementation](references/vite-project.md) |

Briefly report the mode/rationale, data sources and planned APIs before implementation. New Vite projects must normalize the downloaded official template before business edits: ESM only, no `ESM=true/false`, flattened `src/esm` into `src`, adjusted roots/aliases/output paths. Project-side connection logic stays self-contained in `vite.config.js`; no generated `dev-config.mjs`, `vite-dev-plugin.mjs` or Skill-path imports. Do not run the fresh-template normalizer on an existing customized project.

Follow the shared [generated-project footprint](references/validation.md#default-generated-project-footprint): add only the requested page/runtime files, preserving existing user files. Preview, packaging and screenshots are opt-in.

## 3. Select APIs and honor SDK contracts

Read the shared [SDK version](references/sdk-version.md) and [SDK API contracts](references/sdk-api.md) before choosing/loading the SDK or writing SDK calls. Official SDK documentation is primary; local data-type/workflow guidance does not prove published capability. Consult [Source boundaries](references/documentation.md) when verifying a version/contract. Read [Conditional extensions](references/sdk-extensions.md) only for query, users, links or actions; verify the target package's methods, without requiring platform permission settings to generate code. Do not fabricate SQL/filter APIs, borrow methods from a different SDK, silently upgrade existing projects or switch production to a testing channel.

For each operation establish table/fields, ID source, parameter/return shapes and UI states, including permission-error handling. Use the smallest sufficient API combination. Use the SDK version specified in the shared version reference for both page forms.

Load the real SDK: a pinned CDN global `HTMLPageSDK` for single-file, or `import { HTMLPageSDK } from 'seatable-html-page-sdk'` for Vite. Share one instance/init and await initialization before all data operations:

```js
const config = window.__HTML_PAGE_DEV_CONFIG__ || null;
const sdk = new HTMLPageSDK(config ? { ...config } : null);
await sdk.init();
```

When using `createDataAccess` from `assets/sdk-data.js`, let the helper own this initialization and obtain its SDK with `await dataAccess.getSdk()` for other operations; do not create a second instance.

- Production obtains host context. Business/browser source contains no connection constants and never imports `setting.js`; only authorized local tooling injects complete development context.
- Keep **raw SDK reads, normalized view models and field-name write DTOs** separate. `listRows` uses `.data.metadata/results` and per-table key/name mapping; accept equivalent repeated metadata, reject conflicting mappings, and preserve `_id`, raw system keys/display aliases and metadata-informed structured values without default filling or coercion. Row results use `.data`; upload results are direct. Write responses may be partial: merge by `_id` with a verified format or re-read, not replace complete read rows blindly.
- Follow exact single/batch contracts: batch updates use `{ row_id, row }`, batch deletion uses `rowsIds`. Write only intended writable field names, respecting any known restrictions; links use ID arrays, not display labels. Use returned IDs for dependent writes.
- `listRows` supports table/pagination parameters, not invented server filters/sorts. State the fetched scope honestly; do not present first-page statistics as whole-table totals. Use `queryRows` only when supported by the selected SDK; query authorization is independent of read access and failures must remain visible. Handle pagination termination/failure without claiming partial results are complete.
- After schema confirmation, read [SDK-shaped mock data](references/mock-data.md) when simulating behavior. Use fixed typed response samples and the same parser/business/rendering path as live data, with explicit visible simulation and temporary/development-only sample loading. No simulated SDK/backend or screenshot-only harness is needed. Exclude sample data and its loading branch from production; **never fall back to fake success after a live error** or simulate an unavailable production API as verified.

## 4. Implement safe business behavior

Provide loading, empty, validation, success, failure and retry states. Await APIs and disable duplicate submissions. Obtain update/delete IDs from selected `_id` values; deletion requires clear targets and confirmation. Cross-table writes are not assumed transactional: explain partial completion and avoid duplicate-producing retries.

Treat records as untrusted text (`textContent`/safe DOM construction, not raw `innerHTML`); use bracket notation for non-English/spaced names. Errors must not expose tokens or full request configuration. Upload support does not remove Base-image display restrictions; use relative page assets and do not bypass access rules. Page visibility/client filtering is not authorization.

Do not create schema, alter app permissions, probe unrelated data, upload/publish pages or write real test records without explicit authorization. Generated write features do not authorize executing them during validation.

## 5. Preview only on request

Follow [Local configuration and live preview](references/local-preview.md#start-preview-on-request). Check local configuration completeness once and reuse it without repeating authentication verification; directly enter configuration if missing/incomplete. Confirm any unknown real-data read scope and inspect startup code for automatic writes. Do not offer an unconnected preview or substitute mocks after a live error. Service startup/SDK initialization does not prove page/table access; writes/uploads/actions need separate authorization. Retain the exact preview session for targeted cancellation.

## 6. Validate and deliver

Follow [Validation and acceptance](references/validation.md) for checks, project footprint and the [delivery/follow-up list](references/validation.md#delivery-and-follow-up-chat-actions). Inspect scripts/plugins before running existing lint/build-only checks; do not package just to validate generation. Report only checks actually performed, with absolute project paths and unresolved validation.

End ordinary completed generation with **Next steps**: **Preview page** and **Package as an upload ZIP** for data-integrated pages, packaging only for static pages. Each bullet needs a short purpose and a directly sendable instruction in the user's language, not just a label. A running preview uses **Cancel preview** instead. Apply the shared state/decline rules, including the packaging-completion exception; status such as "not started" or "no ZIP created" does not replace these suggestions. Suggestions do not authorize execution.
