# Validation and acceptance

## Default generation checks (no screenshot pass)

The default flow for both modes is: check local configuration completeness without repeating authentication verification, confirm the data structure and operations, implement the page, perform static code/API/structure review and feasible existing lint/build checks, then deliver source and the follow-up hint list. Do not start preview, open a browser, generate effect screenshots, or run capture/inspect/revise cycles merely to finish generation. Do not install browser/capture dependencies or create a mock harness solely for screenshots. A skipped screenshot pass does not skip SDK/data-structure, credential-safety, or build checks; report browser layout/responsive behavior and live integration as unverified unless actually tested.

If the user requests preview, visual acceptance, or screenshots (including in the generation request), use the corresponding workflow below rather than making it a prerequisite for every page. Preview alone does not require screenshots; use only the evidence needed for the requested check.

## Structure and API checks

- When data sources are unknown, stop for clarification instead of delivering guessed API parameters.
- Review confirmed table/field names, types, relationships and operations against code and SDK-shaped mock data; check permission-error handling and any explicitly known restrictions, not platform configuration. Neither mode requires a contract JSON or a temporary validation file; compare the implementation directly with the confirmed structure and operations.
- Use `scripts/check-page.py <dist-or-zip>` to check root index.html, [static resources and production exclusions](#static-resources-and-production-exclusions), and common token/dev-config assignments. Add `--project <project-root>` to match known local tokens. This is a read-only heuristic check, not proof of zero credential leakage or remote CDN availability.

Run with actual paths:

```sh
python3 <skill-root>/scripts/check-page.py <project-root>/dist
# Only after packaging was separately requested and the ZIP exists:
python3 <skill-root>/scripts/check-page.py <path-to-page.zip>
```

## Static resources and production exclusions

The checker inspects every deployed HTML/HTM/CSS file: HTML resource `src`/`href`/object `data`, image/source `srcset`, video `poster`, inline styles/style blocks, CSS literal `url()` and quoted `@import`. Resolve each reference relative to its containing file, including nested CSS/HTML; safe `../` within the deployment root is allowed, escape/root-absolute paths are rejected. Query/fragment parts are ignored for file lookup; remote/data/pure-fragment references are not checked for local existence. Ordinary CSS comments/strings do not create resource dependencies.

This is static literal-reference recognition, not a complete HTML/CSS parser, dynamic-JavaScript resource analysis, full module graph check or remote-URL/network validation. Passing checks therefore does not prove every runtime resource exists.

Packing, deployment checking and the preview allowlist share equivalent production path rules: exclude private/hidden settings, existing `data-contract.json` documentation, development/source directories, test/tests/__tests__/coverage, test/spec JS/TS files, package/lockfiles and common build/lint/test configuration. Normal page JS/CSS/images/fonts/data assets remain allowed. Python packing reuses the checker policy; JS/Python rules are compared through `tests/fixtures/deploy-paths.json`. These exclusions apply to deployment/serving, not deletion of files from an existing source project.

## Default generated-project footprint

Setup has already created root setting.js and .gitignore; generation preserves them and adds only the page/runtime files needed for its mode. Do not create additional credential files, data-contract.json/replacement schema files, deploy-files.json, project tests directories/files, test-only dependencies, page-zip, or deployment ZIPs by default. A single-file manifest is optional and prepared only when a requested preview/packaging needs extra relative assets; without it, only index.html is allowed. These defaults do not remove existing user files or this Skill's own regression tests. Validate through static review, temporary checks outside the project, existing tests, or authorized preview. Do not claim omitted tests or deferred packaging passed.

### Preview screenshots (both page types)

Skip screenshot capture and screenshot-based review/revision loops by default for both single-file HTML and ESM-only Vite, even if captures would be temporary or displayed directly. During authorized connected preview, inspect available DOM/layout, runtime errors and loading/data states first. A layout/screenshot request alone is not connection consent: use an already available authorized page, or confirm before starting connected preview; do not launch an unconnected local service. Capture only when the user requests screenshots/visual acceptance or a specific rendering problem cannot be diagnosed sufficiently from that evidence. Keep captures limited to the relevant state/viewport; do not add routine full-page, multi-viewport or repeated screenshot passes to ordinary generation.

If capture is needed, use direct tool display or a temporary directory outside the page project. Do not create screenshot files or directories inside the project, including hidden validation folders, src, public, assets and dist; adding ignore rules is not a substitute. Keep captures out of project assets, deployment manifests and upload ZIPs. Screenshot success is not evidence of SDK/API connectivity or correct business behavior.

This concerns screenshots captured to review the generated page, not images required by the page itself. Preserve existing user files; do not automatically delete earlier screenshots to enforce the new-generation rule.

## Behaviors to verify with temporary response samples or existing tests

1. No data requests before asynchronous SDK initialization; multiple modules share one init.
2. listRows uses `.data.metadata/results`; per-table mapping preserves `_id`, raw system keys/display aliases, typed values and exact field names. Equivalent repeated metadata is idempotent; conflicting descriptors or output names fail. Mock reads use the same envelope/parser, not name-keyed UI arrays.
3. Reading continues across multiple pages even when each page returns fewer rows than the requested limit; the final empty page ends pagination.
4. Mid-pagination failures or safety limits produce errors instead of returning partial data claimed to be complete.
5. Single/batch methods match parameter and response contracts; writes use only intended writable field names and respect explicitly known restrictions. Returned IDs drive linked writes; partial write rows are merged by ID with a verified format or re-read, never substituted for complete listRows results.
6. Upload results have no `.data`; file-object arrays and image-URL arrays are written to the correct fields.
7. Link writes use actual newly created IDs; a failed second step is not reported as success or blindly retried.
8. Duplicate submissions do not trigger repeated mutations, deletion requires confirmation, and record text cannot execute as HTML.
9. Fixed response samples preserve consistent IDs and confirmed file/image/select/user/geolocation, signature, department-ID and formula/lookup scalar/array shapes, including file extras and zero/false/null/empty/omitted distinctions. Metadata defaults, display formats and formula configuration do not rewrite or synthesize read values. For submission checks, inspect the intended write DTO and, if useful, predefined partial responses or before/after read samples; no stateful SDK/backend emulator is required. Sample checks do not prove real writes, atomicity or link clearing.
10. A real initialization/API failure remains an error, never a silent mock fallback. Production uses the real SDK and excludes sample data and its loading branch; samples never establish method availability or permissions.
11. For used extensions, check installed method availability, business condition/result fields, user identifier resolution, exact task/result paths and bounded polling. Treat query/action authorization failures independently; do not assume task submission/completion means confirmed delivery.
12. Generation with confirmed schema needs no platform permission JSON, role settings or resource-ID mapping. Missing settings must not be treated as disabled access or block code delivery; explicitly known restrictions and authorization for actual live operations still apply.

## Vite validation and deferred packaging

Run only confirmed lint, existing test, and production build-only commands. Inspect lifecycle hooks/plugins and do not run build-page or commands that create page-zip/ZIPs during ordinary generation. If a safe build-only path is unavailable, report the skipped build. Do not add tests to make validation possible or invent passing tests when there is no test script. Check the SDK against the shared [SDK version](sdk-version.md). Production builds must not contain accountToken, setting.js, .seatable configuration, or injected development objects. The ZIP must have index.html at its root and relative resource URLs suitable for embedding. Check single-file ZIPs when packaging is later requested, even when no build step is needed. Do not create an archive just to validate the default delivery.

## Configuration-first and requested-preview checks

Use [Local configuration and preview](local-preview.md) as the procedure for setup, authentication verification, consent, settings changes and targeted shutdown; do not maintain a second setup checklist here. Configuration-only requests and generation must not start services. Authentication, a running service, SDK initialization and HTTP 200 are not evidence of page/table access.

For an authorized preview, check actual localhost availability, required assets and available browser DOM/runtime. Use only the confirmed minimal read, inspect automatic startup mutations, and test writes/uploads/actions only with separate authorization. Verify shutdown of the retained session when cancelled. Regression checks for both modes must cover safe settings parsing/injection, denied private routes, mode-specific reload behavior (including deployment-allowlist changes), credential-independent builds/packaging and preservation of source/settings.

## Live verification boundaries

Without a user-authorized real environment, structure, mocks, and builds can be verified, but API connectivity, permissions, and actual writes cannot be reported as passed. Perform mutations only on test records explicitly authorized by the user; do not implicitly test against real customer data.

Use the [delivery/follow-up list](#delivery-and-follow-up-chat-actions) without triggering actions automatically. Build/packaging success does not authorize upload, permission changes or test writes.

## Conversational acceptance

When maintaining the Skill, select relevant [conversation cases](../tests/conversation-cases.md) to check agent decisions and observable side effects. They are manual/independent-execution inputs, not another rule source or a routine generation step. Detailed tool behavior belongs to automated tests; passing those tests does not establish model compliance, and unexecuted cases remain unverified.

## Delivery and follow-up chat actions

Summarize mode/rationale, absolute source/project paths, confirmed schema/operations and APIs, required table access, checks actually performed and pending validation. This summary does not require a separate schema file; provide ordinary data-structure documentation only on request, without a custom schema/checker or live-verification claims. Report preview URL/status only when requested and attempted; otherwise state preview was not started. State no ZIP was created when packaging was not requested. Mock/build/HTTP success does not prove live integration or browser layout/responsiveness.

After an ordinary completed generation, append a distinct **Next steps** section after the validation summary. Select actions from the state table below; every bullet must contain **an action name, a short purpose and a directly sendable chat instruction**. A bare label such as "Preview page (read-only verification)" is incomplete. Localize the heading, names, explanations and chat instructions to the user's conversation language; keep technical identifiers unchanged. Natural-language instructions are sufficient; invoking `$seatable-html-page` explicitly is also valid.

Default example for a generated data-integrated page with no running preview or delivered current-version ZIP (adapt the validation sentence to checks actually performed):

```text
Validation: Static checks completed. Browser layout and live behavior remain unverified. Preview was not started; no ZIP was created.

Next steps
- Preview page: Connect to SeaTable using the saved configuration, with read-only verification first. Reply: "Preview page."
- Package as an upload ZIP: Create a ZIP ready to upload to Universal App; nothing is uploaded automatically. Reply: "Package this page as an upload ZIP."
```

Render the actions as Markdown bullets with bold action names. Keep the packaging label and its localized equivalent focused on creating an upload-ready ZIP, not a combined packaging-and-upload operation. The example is wording guidance, not a claim that these checks were run. Maintain complete wording here rather than copying another template into each mode's documentation.

| Current response/state | Applicable next steps |
| --- | --- |
| Successful packaging completion, including with a running preview | Return the checked ZIP's actual absolute path and brief result; no Next steps section or follow-up action suggestions. |
| Data-integrated page generated; no preview running or current-version ZIP delivered | Preview page and Package as an upload ZIP |
| Preview service running, even with live verification pending | Cancel preview and Package as an upload ZIP, unless packaging is already complete |
| Purely static page generated | Package as an upload ZIP only; no connection/preview suggestion |
| Current-version ZIP delivered in an earlier reply | Omit the packaging suggestion; retain any otherwise applicable action. |
| User explicitly declined an action or deferred its suggestion | Omit that action until the user asks for it again |

The successful-packaging row takes precedence over the other states for that reply. Do not suggest cancellation, preview or further packaging after delivering the ZIP. Leave any running preview unchanged unless cancellation was also requested; later user requests still follow their own workflows.

For a running preview, the complete cancellation bullet is: **Cancel preview**: Stop this project's preview service while preserving its files and settings. Reply: "Cancel preview." Do not offer cancellation after failed startup or confirmed shutdown, and do not immediately re-offer preview after the user cancels it. After source changes, an older ZIP does not count as packaging the current version.

Apply this same action format and state selection after a page-validation or preview summary when there is an existing deliverable. Do not offer actions for a page that was not generated. A configuration-only request does not produce a page-delivery list. Configuration is already complete before generation; do not repeat connection/setup prompts. Packaging remains independent of preview and credentials.

**Not executing an action is different from not offering it.** "Preview was not started" / "no ZIP was created" are status statements, not substitutes for the next-step list. A user request to generate without automatically starting preview/packaging still receives the applicable suggestions unless the user also declines or defers those suggestions. Do not treat the absence of prior preview/packaging authorization as a reason to omit them. Listing actions does not start/stop a service, access real data, package or upload. Explicit action requests accompanying generation may be fulfilled after the prerequisite without another message; then select suggestions from the resulting state rather than repeating completed actions.

Do not add terminal commands, working directories, predicted ZIP names, manifest explanations or a detailed upload guide to the default list. A packaging request creates/checks the ZIP; uploading still requires separate authorization. Do not invent an archive or running URL after a failed action.

## Skill maintenance and regression tests

Only when maintaining the Skill itself, check SKILL.md name/description for discoverability, resolvable local references and unfinished scaffolding, then run the relevant regression tests below. These are not extra steps for ordinary page generation. Structural checks do not prove automatic skill activation.

```sh
node --test <skill-root>/tests/*.test.mjs
python3 -B -m unittest discover -s <skill-root>/tests -p 'test_*.py'
```

These tests belong to the Skill itself and must not be copied into generated page projects. They use temporary projects, synthetic tokens, and local HTTP requests. The default Vite configuration/injection tests use a stub. To additionally exercise actual Vite serving, settings reload, listener shutdown and production/development-mode builds, point `SEATABLE_VITE_NODE_MODULES` at an existing project dependency directory with Vite and the template's ESLint dependencies, then run the Node suite again. The optional tests never install packages; they use temporary synthetic template-shaped projects, not a full generated business page. Report full real-template or browser validation separately. They use synthetic authentication servers only and do not connect to SeaTable or prove that a model follows every conversational acceptance scenario.

Data-access regression checks also belong to the Skill, not generated projects. Fixed synthetic response samples and small test-local SDK stand-ins exercise typed key/name mapping, equivalent/conflicting repeated metadata, canonical system keys/display aliases and collision rejection, structured cells/formula arrays, per-table isolation, SDK initialization/error propagation, configuration validation, pagination boundaries and conditional-query parsing. The conversation cases separately cover generation after local configuration without platform permission settings, not proven by these unit tests. These checks do not provide a reusable mock SDK or verify real query/write/upload behavior, permissions, users, actions or geolocation against a server.
