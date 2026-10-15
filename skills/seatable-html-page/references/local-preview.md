# Local development configuration and preview

Configure the page project first, generate the page next, and preview only when requested. Both page forms use **root `setting.js`**. Do not treat the Skill installation as the page project.

## Usage steps

1. Ask: "Use $seatable-html-page to configure the local development environment for this project."
2. Edit the opened root `setting.js` locally. Never send the token or file contents in chat.
3. Say: "Configuration complete." The agent checks the file and makes one basic authentication request. No page is generated and no preview is started by this instruction alone.
4. After basic connection succeeds, describe the page and its tables/fields. The agent only checks local configuration completeness before generating or modifying page code; it does not repeat authentication verification.
5. After generation, ask to preview the page. This checks local configuration completeness without repeating authentication verification, then uses the saved configuration and real SeaTable data, with an agreed small read first. There is no separate unconnected preview.
6. While the service runs, use **Cancel preview** to close it. Packaging is a separate request and does not require credentials or a running preview.

Adapt these examples and action labels to the user's conversation language.

## Initialize the project configuration

Resolve/create the intended page project directory first; ask for a path only when it is ambiguous. Enter this flow when the user requests configuration, or directly when a generation/modification/preview request finds missing or incomplete settings; do not ask the user to send a separate setup instruction. Run the Skill tool externally:

```sh
node <skill-root>/scripts/setup-local.mjs --project <project-root>
```

Open `<project-root>/setting.js` for local editing. This step does not need a single-file/Vite choice, template download, npm installation, page generation or service startup. It creates only the private settings file and appends missing `.gitignore` rules. Existing values and rules are preserved; settings permissions are restricted to 0600. Existing tracked credentials must be handled by the user, not automatically untracked. For exposed tokens, advise revocation/rotation and user-managed history cleanup.

The static ESM object has exactly four literal string fields:

```js
export default {
  server: '',
  appUuid: '',
  pageId: '',
  accountToken: '',
};
```

- Copy `server`, `appUuid` and `pageId` from the target HTML page's **HTML page development information**. The target page must already exist. Preserve the complete service path, not just the domain.
- Obtain `accountToken` from **Personal settings -> Profile -> Account-Token**. Keep this menu path in English verbatim, even when responding in another language; do not translate or substitute its labels. The identifier in the file remains `accountToken`.
- Prefer HTTPS for remote servers. An HTTP connection sends the token without TLS; use it only in a trusted development environment.

Setup adds private/build rules (`/setting.js`, the protective legacy `/src/setting.js`, `/.env.local`, `/dist/`, `/page-zip/`) and OS-file rules:

```gitignore
.DS_Store
._*
__MACOSX/
Thumbs.db
[Dd]esktop.ini
```

OS rules also cover nested files. Only missing rules are appended. Already tracked OS files are reported, not deleted or removed from the Git index.

Only root `setting.js` is supported. If `src/setting.js` exists, stop and explain an explicit migration to the root, preserving values and updating ignores/imports. Do not choose between two inputs, copy credentials automatically or delete the legacy file without permission. Setup, verification and preview reject the legacy path even when the root file is absent.

Settings are parsed without executing JavaScript. Comments, single/double quotes and trailing commas are allowed; imports, expressions, functions, nested/extra fields and placeholders are not. No connection JSON, secondary credential export or persistent "configured" flag is created. Keep tokens out of browser/business source, `public/`, URL parameters, localStorage and `VITE_*` variables.

## Verify the connection when configuration is complete

When the user confirms local editing is complete, run:

```sh
node <skill-root>/scripts/verify-local.mjs --project <project-root>
```

The tool validates structure, values, paths and Git protection, then makes a time-limited GET to the SDK's application access-token endpoint, using `Authorization: Token ...`. It preserves the service subpath, refuses redirects and requires a non-empty `access_token` in the response; HTTP 200 or an HTML login page is not enough. It never saves or prints runtime tokens, request headers, raw response bodies or network exceptions. No business rows/metadata are read or written.

Report **basic connection verified; page/table access pending**. This handshake does not send or validate `pageId`, test table access, or prove production visitor permissions. A later authorized minimal SDK read is needed for the page/data path. Use the shared [SDK version](sdk-version.md).

If verification fails, give a sanitized correction hint, keep configuration in progress and wait for local correction/completion before retrying. Do not claim success or fall back to mock credentials. After success, resume any generation/modification/preview request that entered this configuration flow; a configuration-only request still generates no page and starts no preview. Verification here does not authorize business-data access.

## Check completeness before generation or preview

For a generation/modification request, run one local-only check:

```sh
node <skill-root>/scripts/verify-local.mjs --project <project-root> --check-only
```

This uses the shared settings reader to check the four fields, static format, placeholders, path safety and Git protection. It makes no authentication request, does not need an earlier verification record and creates no status file. For preview, `preview.mjs` already performs this local check when loading settings; do not run the verifier separately before startup.

- Complete settings: continue the requested action without repeating setup or authentication verification, even in a new conversation or after complete values change. Completeness is not a claim that live access was just verified.
- Missing/incomplete settings: directly enter the initialization flow above, preserve existing values, open the file and wait for completion. Verify the basic connection once at completion, then resume the original request. Do not generate source, download a template, install dependencies or start preview while configuration is incomplete.
- Unsafe paths, tracked/unignored credentials or legacy settings: explain the specific correction; do not bypass safety checks or silently migrate/delete files.

This is an agent workflow prerequisite, not a build dependency. Standalone lint/build, packaging, cancellation and design-only discussions need no successful connection. Creating source code, including a requested disconnected prototype or static SeaTable page, still follows the configuration-first workflow; do not confuse this prerequisite with permission to inspect business data.

## Start preview on request

Use the [shared follow-up actions](validation.md#delivery-and-follow-up-chat-actions) after generation. A preview request reuses the existing project/configuration; explain that it accesses real data and confirm any still-unknown read scope. Do not repeat completed setup or schema questions. Check local completeness through the preview startup settings reader, not another authentication request. This removes only the extra verifier call; the page still initializes the SDK and makes its authorized live requests. Missing/incomplete settings directly enter configuration; complete changed values do not require a separate verification gate. Do not offer an unconnected preview.

Inspect startup code for automatic writes/actions before running or opening it. Limit initial validation to a small read on a confirmed authorized table. Creating write-capable UI is not permission to exercise writes, uploads or actions. Never probe unrelated tables or substitute samples after a live error.

```sh
node <skill-root>/scripts/preview.mjs --project <project-root> --mode single
# or, after installing the project's dependencies:
node <skill-root>/scripts/preview.mjs --project <project-root> --mode vite
```

The mode chooses the page runtime, not the settings location. Both read root `setting.js` without rewriting it. The single-file server injects escaped settings into HTML responses, serves only `index.html` or the explicit optional deployment allowlist, and requires no npm/Vite. Vite uses project-local dependencies; its self-contained `vite.config.js` reads root settings relative to `import.meta.url`, watches changes and injects the same development context. Browser modules must not import `setting.js`. Do not copy Skill helpers into the generated project.

Both services bind to localhost and deny direct private-file routes, including settings, `.git` and environment files. The browser still receives the token through the injected context: use a trusted browser and dependencies and do not expose the service to LAN/public internet. Production builds never read/inject settings, including `build --mode development`. `vite preview`, generic directory servers and production-output servers are not alternative Skill preview paths. A token-free browser would need a separate server-side proxy design.

Retain the project path, terminal/session or exact process handle and actual URL. Check HTTP availability/assets, then inspect available browser DOM/runtime and loading/data/error states. Distinguish server startup, browser rendering, basic authentication and successful page/table reads. SDK initialization may catch authentication errors; its resolution is not evidence of live access. A failed read does not retroactively verify `pageId` or prove that every failure is an invalid token.

Use an available permitted localhost port; do not change firewall/proxy settings, kill unrelated processes or install extra preview dependencies. Report execution/network/layout limitations accurately, without pretending a dead URL is running. Do not start preview after setup, verification or generation unless preview was already requested.

## Stop the preview service

In a preview summary while the service runs, report its actual URL/status and select **Cancel preview** using the [shared action-state rules](validation.md#delivery-and-follow-up-chat-actions), even when live verification is pending. A later successful packaging reply has no follow-up action list and leaves the service running unless cancellation was also requested. No running service means no cancellation action; listing it does not stop anything.

On cancellation, send Ctrl+C to the retained terminal/session or SIGINT/SIGTERM to the exact preview process for this project. The Skill runner closes either service. Wait for process exit and verify the listener has stopped before reporting success; closing a browser tab is not enough. With a lost handle, identify the process by project/launch command or clarify ambiguity. Never kill all Node/Vite processes or an unidentified port owner.

Preserve source, settings and dependencies. Cancellation does not revoke tokens, reconnect, regenerate or package. If already stopped, report that without starting anything.

## SDK context and later changes

```js
const config = window.__HTML_PAGE_DEV_CONFIG__ || null;
const sdk = new HTMLPageSDK(config ? { ...config } : null);
await sdk.init();
```

Validate all four fields of a present development object and use one shared init via `assets/sdk-data.js`. Production receives host context. Explicit reconfiguration verifies the basic connection once when the user confirms completion; later generation/preview checks only local completeness. After connection values change, use a fresh page load to establish the new SDK context:

- **Single-file:** fully reload the browser; no preview restart is needed. Each page response reads and validates root `setting.js`; invalid settings return an error instead of reusing old values. Ordinary HTML edits also need only a browser reload. The [deployment allowlist](single-file.md#local-live-preview-and-later-packaging) is revalidated on every request; asset-list changes need no restart.
- **Vite:** settings changes trigger a full browser reload; the next HTML response reads the new values. A full browser reload establishes the new SDK context without a separate authentication precheck. Ordinary source edits use Vite's update behavior. Restart for Vite/server configuration changes when needed.

Do not mutate an already-initialized SDK instance. Named multi-target selection is not provided.

Preview needs no screenshots; follow the [screenshot rules](validation.md#preview-screenshots-both-page-types) when requested. Packaging remains independent. Existing production output can be checked with `check-page.py <dist-or-zip> --project <project-root>`: it scans the static root token and literal/JSON-escaped forms without executing settings. Absent credentials are allowed; this detects common leaks, not every transformed/encrypted secret. Refuse deployments containing credentials, settings, development injection or unrelated source.
