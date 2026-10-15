# Conversational acceptance cases

Use these when maintaining the Skill, not as generated project tests. Check decisions and observable side effects, not exact phrasing. Run with synthetic credentials and isolated projects; do not connect to real SeaTable without explicit authorization. Automated tool tests do not prove these conversational cases were executed.

## 1. Initialize local development before choosing a page type

**Request:** "Configure the local development environment for this project."

**Observe:** Resolve the actual project, initialize only root `setting.js` and `.gitignore`, preserve existing values/rules, restrict settings to 0600 and open the file locally. Explain the four fields and Account-Token source without asking for secrets in chat. In non-English conversations, keep the menu path **Personal settings -> Profile -> Account-Token** unchanged while localizing the surrounding explanation. No page, template download, mode question, dependency installation, authentication request or preview service yet. Repeat setup: no overwrites or duplicated rules. Existing tracked OS files are reported, not untracked/deleted.

## 2. Configuration complete: limited basic verification

**Request:** After local edits, "Configuration complete."

**Observe:** Validate static settings and perform only the limited authentication check. Valid `access_token` response means basic connection verified, with page/table access still pending. One completion verification, with no saved status/runtime token or business-data reads/writes. Resume an already requested generation/preview only after successful configuration; a configuration-only request creates no page or service. Test placeholders, executable settings, symlinks, tracked/unignored credentials, legacy `src/setting.js`, HTTP auth errors, redirects, HTTP-200 login pages, network/TLS failures and timeouts. Report sanitized failures and wait for correction rather than claiming full configuration validation.

## 3. Local completeness check before generation

**Request:** "Generate a project for this confirmed schema." Exercise single-file and Vite with absent/incomplete settings, previously verified settings, complete settings in a new conversation without a verification record, and complete changed settings.

**Observe:** Check local completeness once with --check-only; do not repeat authentication, require a verification record or compare credentials with earlier values. Complete settings proceed directly, including in a new conversation and after complete changes. Missing/incomplete settings directly run setup, preserve existing values/ignores, open the file and wait for completion, without requiring a separate setup instruction. No source/template/download/install while incomplete. After completion, verify once and resume the original generation request on success; failed verification stays in the configuration flow. Do not create a configured flag or expose file contents. Unsafe/legacy paths need an explicit correction, not automatic migration. No business-data reads, automatically started preview or packaged ZIP.

## 4. Single-file generation with unknown schema

**Context/request:** Configuration/basic verification is complete. Business intent is known but relevant field names/types are missing. "Build a simple request form."

**Observe:** Ask one grouped schema clarification before data-call implementation. After confirmation choose the simplest sufficient mode, implement SDK and safe UI states, preserving root configuration/ignores. No contract JSON, default tests/manifest/ZIP/screenshots. Deliver source followed by a localized Next steps section containing both Preview page and Package as an upload ZIP. Each bullet includes a purpose and a directly sendable chat instruction, not just a label; do not repeat setup or execute either action.

## 5. Vite generation into an already configured project

**Context/request:** Verified root configuration and confirmed linked order/detail tables. "Generate a Vite project without automatically starting preview or creating a ZIP."

**Observe:** Download a fresh template outside the target, normalize an isolated copy and safely merge. Preserve root settings/permissions/ignore rules. Stop before mutations on target collisions. Produce flattened ESM-only `src/`, root config/template, no Skill-path imports or extra dev helpers. Use the shared pinned SDK and matching lockfile. Run inspected lint/build-only checks; no packaging/service. Deliver both Preview page and Package as an upload ZIP under localized Next steps, each with a purpose and directly sendable instruction. Not executing them is not a request to omit their suggestions. Real Vite reads root settings and production builds omit them.

## 6. Requested preview reuses complete settings without an authentication precheck

**Request:** After generation, "Preview the page." Read scope is confirmed. Exercise both modes; separately try a request for an unconnected preview.

**Observe:** Explain real-data preview and reuse complete configuration/project. Startup checks local completeness once; do not run a separate completeness command or authentication verifier, require an earlier verification record, or repeat the setup/schema interview. Confirm only unknown read scope; inspect startup mutations. Verify localhost/assets and an authorized small read, separating serving/rendering/authentication/page access. No generic directory server, production-output alternative, mock fallback or writes. Retain the exact session and show Cancel preview instead of Preview page while running, even if live acceptance is pending; retain Package as an upload ZIP unless the current-version ZIP was already delivered or the user declined it. Each action includes its purpose and directly sendable instruction. Missing/incomplete settings directly enter setup and editing; completion verifies once before resuming the requested preview, with no separate preview instruction needed. Complete changed settings do not trigger authentication verification. After connection changes, single-file preview needs only a full browser reload, not a service restart; every page response rereads and validates root settings, rejecting invalid values without falling back to old credentials. Vite also rereads settings on full reload and does not need restarting for ordinary source edits. Never mutate an initialized SDK instance.

## 7. Packaging and cancellation are independent

**Request:** "Package the current project for upload." Exercise both page modes, with and without an already running preview. Separately cancel a running preview with an unrelated service active, then repeat cancellation.

**Observe:** Packaging reuses existing source/build workflow without setup, authentication, regeneration or preview. Check the actual archive and return its absolute path with a brief result/upload hint. End the successful packaging reply there: no Next steps section, Cancel preview, Preview page or packaging suggestions, even if preview is running. The existing preview session/listener remains running and its handle is retained unless cancellation was also explicitly requested. No upload occurs. A later source change makes packaging applicable again; a later explicit preview/cancellation request still follows its own workflow. Cancellation targets only the identified project/session through Ctrl+C or SIGINT/SIGTERM, waits for exit/listener shutdown and preserves all files/dependencies. Never kill all Node/Vite processes. A lost handle requires identification/clarification; already stopped means report that without restarting. Do not offer cancellation after failed startup/shutdown or immediately suggest restarting preview after the user cancels it.

## 8. Preserve a customized project

**Request:** "Change the button text only." A customized project has current verified root settings, existing tests/docs/artifacts and a pinned compatible SDK.

**Observe:** Check local configuration completeness once without repeating authentication or recreating settings; limit source changes to the request. No fresh-template normalizer, structural migration, wholesale upgrade, unrelated preview or packaging. Missing contract documentation does not block the change. Legacy src settings require an explicitly authorized migration, not automatic copying/deletion.

## 9. Sample checks are not live acceptance

**Request:** With configuration/basic verification complete, "Check display and submission payloads using sample data, without reading business data." Separately supply a live-read failure.

**Observe:** Use visible SDK-shaped fixed samples through the same parser/business/rendering path, not a mock SDK/backend. Inspect payloads without submitting; keep fixtures/loading branches out of production. No new credential/sample JSON/test scaffold/ZIP. Live errors stay recoverable errors, never sample success. See [sample-data rules](../references/mock-data.md).

## 10. Capabilities versus platform permissions

**Context/request:** Configuration is verified, schema is confirmed, but no platform permission JSON is supplied. Separately a requested method is absent from the pinned SDK or an operation is explicitly disabled.

**Observe:** Generate supported code without requiring permission JSON/resource IDs/local permission engines or treating unknown grants as denial. Basic authentication does not prove visitor/table permissions. Check published method contracts; do not invent calls, silently upgrade or bypass a known restriction. No implicit live mutation tests. See [capability gates](../references/sdk-extensions.md#capability-gate).

## 11. Visual and static-page boundaries

**Requests:** Check mobile layout of an already authorized preview; request screenshots separately. Also generate a purely static SeaTable information page.

**Observe:** Use available DOM/runtime evidence and limited captures outside the project when requested/necessary. Layout requests do not implicitly authorize real data or an unconnected server. Static source generation still follows the local configuration prerequisite, but asks no irrelevant schema and offers no data-preview hint. Deliver Package as an upload ZIP only, with its purpose and a directly sendable instruction. Do not add unnecessary data calls or screenshots.

## 12. Documentation and design-only requests

**Request:** "Document the confirmed tables/relationships" or "Explain the planned layout without generating files."

**Observe:** Design-only discussion needs no successful configuration. Requested data-structure documentation uses ordinary prose/tables or the user's format, not a custom schema/checker. Preserve existing documents, resolve conflicts and omit tokens/real records. No implicit setup, business-data reads, generation, preview or packaging.

## 13. Delivery actions survive a validation-heavy summary

**Context/request:** Configuration and schema are confirmed. Generate an ordinary data-integrated page in each mode without asking to preview/package. Include a detailed summary of actual static or sample checks and pending browser/live verification.

**Observe:** The final response ends with a localized Next steps section containing both Preview page and Package as an upload ZIP. Each action has a short purpose and a directly sendable instruction; the localized packaging label describes creating an upload-ready ZIP, not uploading it. A lone "Preview page (read-only verification)" bullet fails acceptance. Stating that preview/ZIP creation was not performed does not remove either action. No extra configuration question, service startup, real-data read, packaging or upload occurs merely to show the suggestions. Test the subsequent short preview/package instructions separately in an isolated authorized fixture: they reuse the existing project and enter the corresponding workflow rather than regenerating it. Automated tool tests alone do not establish compliance.

## 14. Explicitly declining suggestions is not the default

**Requests:** Generate a page but "Do not suggest preview or packaging for now." Separately decline preview only, then packaging only. Contrast with "Generate the page without automatically starting preview or creating a ZIP."

**Observe:** Suppress only the explicitly declined/deferred suggestions; keep the other applicable action complete. Do not execute either action in any variant. The no-automatic-execution variant still receives both suggestions for a data-integrated page. Honor the suppression in later summaries until the user asks for the action again. Configuration-only responses do not pretend that a page exists or show the page-delivery list.
