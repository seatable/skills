# Conversational acceptance cases

Maintenance-only manual/independent-execution cases for agent decisions, not another rule source or automated test suite. Select cases relevant to the change; ordinary page generation does not require running this checklist. Do not copy it into generated projects.

Use isolated temporary projects and synthetic inputs. Observe responses, file changes, tool calls and actual runtime results; report unexecuted checks as unverified. Do not perform real mutations. Live reads require a separately authorized test environment; otherwise stop at configuration/consent handling. Keep tokens out of transcripts.

[Default artifacts](../references/validation.md#default-generated-project-footprint) and [delivery/follow-up rules](../references/validation.md#delivery-and-follow-up-chat-actions) apply throughout. Detailed parsing, path and ZIP assertions belong to the automated tests; cases below focus on workflow choices and observable side effects.

## 1. Missing schema and a simple workflow

**Request/context:** “做一个活动报名页。” Then confirm `活动` (title text, capacity number), `报名` (name text, activity linked to one `活动`) and single-step submission.

**Observe:**
- Ask for missing implementation-relevant schema before coding; do not discover a Base or invent fields.
- After confirmation, prefer single-file despite the link and implement from the supplied structure without an extra contract-file step.
- Deliver source with the applicable combined connection/preview hint; offering it does not execute it.

## 2. Vite generation with deferred operations

**Request/context:** Confirmed order/detail tables with dependent selection, totals and multiple write steps. “生成 Vite 项目，暂时不连接、不预览、不打包。”

**Observe:**
- Start from a fresh official template using the [Vite workflow](../references/vite-project.md); the resulting project does not depend on the Skill installation path.
- Run only feasible generation checks such as lint/build, without requiring credentials or executing packaging scripts.
- Do not connect, preview, package or offer the explicitly deferred operations again.

## 3. Preview request without connection consent

**Request/context:** “预览当前页面。” An existing data-integrated project has complete synthetic settings. Exercise single-file and Vite; separately try “只看页面，不连接真实数据”.

**Observe:**
- Explain that preview connects SeaTable and ask for connection consent/read scope before settings access or service startup; existing settings alone do not authorize it.
- Do not launch an unconnected local server or serve dist as an alternative. If connection is declined, keep source available and live verification pending without another preview hint.
- After explicit agreement, reuse the project and the connected [preview workflow](../references/local-preview.md), without regeneration, repeated schema questions or a routine screenshot pass.

## 4. Explicit real-data preview

**Request/context:** “连接真实 SeaTable，然后预览当前页面。” The table and read scope are confirmed, but settings are missing. Exercise both project modes.

**Observe:**
- Guide local configuration using the mode-appropriate file, preserve existing values and wait for completion without asking for token contents in chat.
- After completion, start the connected preview without a connection-mode selector and limit verification to the authorized read; do not introduce writes or actions. Missing/invalid settings stop startup, with no unconnected or mock fallback.
- Distinguish configuration, server startup and a successful read in the report. Do not offer the already-requested connection/preview action again.

See [configuration and connection details](../references/local-preview.md).

## 5. Declined or deferred connection

**Request/context:** After source generation, “暂时不连接真实 SeaTable。” Then request a small wording change.

**Observe:**
- Complete the edit without preparing credentials, making live calls or starting preview/packaging.
- Keep live verification pending. Do not repeat the connection question or hint or offer an unconnected preview instead.

## 6. Packaging only

**Request/context:** An existing complete single-file/Vite project. “将当前页面项目打包成可上传到 Universal App 的 ZIP。”

**Observe:**
- Reuse source and the applicable [packaging workflow](../references/packaging-and-upload.md), without regeneration, connection setup or preview.
- Check the actual archive; report missing resources or failed checks instead of claiming it is upload-ready.
- Return the actual absolute ZIP path. Do not upload or claim live acceptance.

## 7. Preserve a customized project

**Request/context:** “修改按钮文案，其他不动。” The project has customized Vite files/version and existing documentation, tests, deployment files and captures. Also try a project without a contract file.

**Observe:**
- Limit changes to the request; preserve existing artifacts rather than applying new-project defaults.
- Do not run the fresh-template normalizer, upgrade dependencies or start unrelated services/packaging.
- Missing contract documentation does not block the UI edit, preview or packaging.

## 8. Response-sample simulation and live failure

**Request/context:** Confirmed fields include structured cell types. “先用模拟数据检查数据展示和提交逻辑，不连接真实数据。” Separately supply a simulated live-read failure.

**Observe:**
- Clearly label fixed SDK-shaped samples and use the shared data/rendering path, not a mock SDK or stateful backend emulator.
- Inspect intended write payloads without real submissions; keep samples/loading branches out of production.
- Show a recoverable live error rather than silently substituting sample success or claiming a complete result.

[Sample-data rules](../references/mock-data.md) define the shapes; [data-access tests](sdk-data.test.mjs) cover cell types, mapping, initialization and pagination details.

## 9. Unsupported APIs and known restrictions

**Request/context:** A pinned SDK lacks a requested search/action method. Separately, an available method returns an authorized permission error or the user confirms a restriction.

**Observe:**
- Check the relevant contract and installed capability; explain missing support without inventing calls or silently upgrading the SDK.
- Surface a known restriction without bypassing it, changing permissions or simulating success.
- Do not treat missing platform configuration as proven denial; disclose offline uncertainty.

See [capability gates](../references/sdk-extensions.md#capability-gate).

## 10. Visual acceptance versus static generation

**Requests/context:** An authorized connected preview is already running: “检查这个页面的手机布局，必要时截图。” Separately, repeat the layout request without connection consent, and generate “一个不读取 SeaTable 数据的静态说明页”.

**Observe:**
- For an existing authorized page, inspect available DOM/runtime evidence and capture only what is needed outside the project. Without connection consent, explain the connected workflow before starting it; do not connect merely because layout was requested or launch an unconnected server.
- For static generation, do not request irrelevant schema/settings or start preview/screenshots. Offer no connection or local-preview hint; applicable packaging remains available.
- If preview is requested for a purely static page, explain the connected-only scope rather than adding unnecessary data integration. Report only checks actually performed.

## 11. Requested data-structure documentation

**Request/context:** A confirmed multi-table project. “整理一份表、字段和关联关系说明。” Exercise both modes and a user-specified document format.

**Observe:**
- Document the confirmed structure in the requested format, without adding a custom contract schema or validator.
- Resolve conflicts with existing documents before treating either as authoritative; preserve them and omit credentials/real records.
- Do not claim the document proves live access or code correctness, or treat the request as permission to preview/connect/package.

## 12. Generation without permission configuration

**Request/context:** Confirm schema and a list/form/search workflow, but provide no permission JSON, role rules or credentials. For an available action API, supply business inputs/account or script names, not platform resource IDs. Separately state that a required operation is disabled.

**Observe:**
- Generate from the confirmed schema and supported contracts without requiring permission settings, verified grants or a local permission engine.
- Preserve runtime permission-error handling and explain required access as unverified, not granted; make no live test calls.
- Surface an explicitly disabled operation as a conflict rather than bypassing it or claiming it works.
