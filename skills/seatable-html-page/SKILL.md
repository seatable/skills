---
name: seatable-html-page
description: Create or modify SeaTable Universal App HTML pages from business requirements and confirmed tables, fields, types, and relationships, or package an existing page project into an upload-ready ZIP on request. Choose a single HTML file or a Vite multi-file project, integrate seatable-html-page-sdk, select verified APIs, and support local live-data preview with server/appUuid/pageId/accountToken. Use for SeaTable custom forms, data lists, dashboards, and business tools, not ordinary websites, direct REST integrations, or automatic Base schema changes.
---

# SeaTable HTML Page

Create Universal App HTML pages with confirmed data structures and verified `seatable-html-page-sdk` APIs. Respond and localize page text in the user's language; preserve exact table names, field names and option values.

## Route the request

- **Generate or modify:** follow the workflow below. Inspect an existing project's structure, versions and scripts first; preserve user files, tests and artifacts. Confirm structural migrations separately.
- **Preview after connecting SeaTable:** follow [Connected preview](references/local-preview.md). This is the only preview workflow; do not offer or start an unconnected local preview. Reuse the project without regeneration or repeated schema questions. Require explicit connection consent and an authorized read scope; if the user only says “preview”, explain that it connects SeaTable and confirm before configuring or reading. Existing settings alone are not consent. Purely static pages need no connection or preview suggestion.
- **Package an existing page:** follow [Packaging and upload](references/packaging-and-upload.md) directly. No regeneration, repeated schema questions, credentials or preview prerequisite. Create/check the actual ZIP and return its absolute path with a short upload hint.

For preview/packaging, resolve the project from conversation/workspace; ask for its path only if ambiguous or unavailable. Do not treat the Skill folder as the page project. Packaging or preview does not authorize upload, permission changes or real-data writes.

## 1. Confirm data structure and operations

Establish the page goals/interactions first, then confirm only the needed schema: exact table/field names, types and writable fields, select values, link owners/targets/cardinality/display fields, record selection, display/filter/sort/calculation/write scope and relevant data-volume limits. Confirm date formats/timezones and numeric units/precision where they affect implementation. Runtime record IDs come from selected/created rows; do not ask for every ID in advance. Generation needs no platform permission configuration or proof of access; unknown access is not missing schema or evidence of denial. State required operations and respect explicitly known restrictions; actual authorization is enforced by SeaTable and verified only during authorized live checks.

**Collect missing implementation-relevant names, types or relationships into one clarification request before writing data calls.** Business labels are not field names. Reuse confirmed/authorized context without asking again, but do not claim verification without evidence. Never inspect a Base proactively when reading is not authorized. With unknown schema, offer a design; generate a disconnected prototype only if explicitly requested and label it as not integrated. Purely static pages need no irrelevant schema. Use disclosed, reasonable defaults for noncritical volume, ordering and styling choices rather than blocking on them. User-supplied schema supports generation; authorized metadata can confirm structure, not effective permissions; live results prove only the operations actually exercised.

Apply the confirmed structure and operations directly to code and SDK-shaped mock data; neither mode generates `data-contract.json`, a substitute schema file or a temporary validation file by default. If the user requests data-structure documentation, describe the confirmed tables, fields, relationships and operations in ordinary prose/tables or the requested format, without a Skill-specific contract schema or checker. Keep tokens, real row data and local connection details out of that documentation. Preserve existing user documents and resolve conflicts with confirmed requirements before relying on them; their absence does not block generation, preview or packaging. Generation and packaging need no credentials.

## 2. Select the mode and implement

Choose by maintainable business complexity, not table count, code length or link-field presence. Respect a requested mode; explain and confirm migration if it becomes impractical.

| Mode | Use when | Required reference |
| --- | --- | --- |
| Single-file HTML | Independent display/simple submission, limited state, no build-only dependency | [Single-file implementation](references/single-file.md) |
| Vite multi-file | Coordinated filters/calculations, conditional or multi-step workflows, complex state, reusable modules or npm dependencies | [Vite implementation](references/vite-project.md) |

Briefly report the mode/rationale, data sources and planned APIs before implementation. New Vite projects must normalize the downloaded official template before business edits: ESM only, no `ESM=true/false`, flattened `src/esm` into `src`, adjusted roots/aliases/output paths. Project-side connection logic stays self-contained in `vite.config.js`; no generated `dev-config.mjs`, `vite-dev-plugin.mjs` or Skill-path imports. Do not run the fresh-template normalizer on an existing customized project.

New-project defaults for both modes: **no project tests/test scaffolding, `deploy-files.json`, private connection files, `page-zip`/ZIP, service startup or screenshot pass.** Explicit requests can add the relevant step; preserve existing user files. Read the [validation and delivery rules](references/validation.md) before finishing.

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

## 5. Connect real SeaTable only after consent

Follow [Local configuration and live preview](references/local-preview.md). After the user requests/accepts connection, initialize without overwriting existing values and **open the mode-specific file for local editing**:

- Single-file: root `setting.js`, one static default-export object.
- Vite: only `src/setting.js`, one static default-export object; no connection JSON or generated secondary settings.

Both reuse `assets/setting.template.js` and contain only `server`, `appUuid`, `pageId`, `accountToken`. Explain their sources, wait for local completion and never request token/file contents in chat. Reject the other mode's configuration path or two coexisting inputs without copying credentials or selecting a target. Read only the current settings paths; no old-format detection or migration is provided.

After consent, use `scripts/setup-local.mjs --project <project> --mode single|vite`, then `scripts/preview.mjs --project <project> --mode single|vite`. The runner requires complete local settings and has no unconnected preview mode or connection selector. Do not copy Skill helpers into Vite projects. Keep settings private, ignored/untracked and out of builds/routes; serve locally only. The browser receives the injected token, so local preview is not secret from that browser. Restart/fully refresh after connection changes.

Inspect startup code for mutations before opening connected pages. Service startup/SDK init is not proof of connectivity: verify a small read on a confirmed authorized table. Writes/uploads/actions require separate scope/confirmation. Missing configuration or live errors must not fall back to mocks. Declining/deferment leaves live verification pending without blocking delivery or repeating the connection hint.

## 6. Validate and deliver

Use [Validation and acceptance](references/validation.md) for checks, footprint and screenshot rules, then its [single maintained follow-up list](references/validation.md#delivery-and-follow-up-chat-actions).

Perform static SDK/data-structure/security review and feasible existing lint/build-only checks. Inspect lifecycle hooks/plugins before execution; do not run packaging just to validate generation. Validate existing production output with read-only `scripts/check-page.py <dist-or-zip> --project <project>` when available; do not create an archive merely to check it. Static checks are not a complete security audit or live API verification. Preserve hashed Vite assets; update fixed asset URLs when changed.

Deliver mode/rationale, absolute source/project paths, a brief confirmed schema/operation summary (no separate schema file required), APIs used, required table access, checks actually performed and unresolved validation. State preview not started/ZIP not created unless explicitly requested and performed. Keep browser layout/responsiveness and live behavior unverified without actual evidence. Add only applicable follow-up chat actions as a Markdown list. After generating a data-integrated page, offer only “连接 SeaTable 后预览（可选，先只读验证）” for preview; do not offer a separate local preview. Purely static pages receive no connection/preview hint. Packaging remains a separate optional action. Listing them is not authorization to run them. Preview and packaging reuse the existing project. No terminal commands or detailed upload steps in the default delivery.
