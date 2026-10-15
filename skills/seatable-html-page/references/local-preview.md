# Preview after connecting SeaTable

Preview is a single connected workflow, not a choice between ordinary local preview and live preview. Generation, static checks, builds and later packaging require no credentials. At generation delivery, offer the optional connected-preview chat action from [Delivery and follow-up actions](validation.md#delivery-and-follow-up-chat-actions); do not configure, connect or start a service automatically. Never put tokens in chat, business/browser source, public/, URL parameters, localStorage or VITE_* variables.

## Offer and guide connected preview

For data-integrated pages, offer “连接 SeaTable 后预览（可选，先只读验证）” after generation, subject to the shared follow-up rules. Do not offer or start an unconnected local preview, use a generic directory server, or serve a production build as an alternative preview path. Purely static pages receive no connection/preview suggestion and do not need irrelevant settings; if preview is requested for one, explain this workflow's connected scope rather than inventing data integration.

Configure/connect only after an explicit request or acceptance. If the user only asks to “preview”, explain that this workflow connects real SeaTable data and confirm before preparing settings or reading; existing settings are not consent. An explicit connect-then-preview request, including one accompanying generation, already supplies that intent and does not need a second confirmation. Initial verification is read-only; mutations require separate records/scope confirmation.

After acceptance:
1. Reuse the existing project and confirmed table/read scope. Inspect startup code for automatic writes or actions before running or opening it.
2. Run setup-local with the actual page type if configuration is missing; it preserves existing edits and creates/restricts the private file to 0600. Open **setting.js for single-file HTML, src/setting.js for Vite**.
3. Explain the four values below. Ask the user to fill locally and confirm completion, never send the token or file contents.
4. Validate/start the matching page type without showing values. Missing/incomplete settings are errors, not permission to fall back to host context, an unconnected preview or mocks.
5. Verify a small read on a confirmed authorized table and inspect read-only loading/data/error states. No probing unrelated tables or mutations. Report server startup, SDK initialization and successful reads distinctly; stop for unresolved configuration/network/permission failures.

Use the Skill runner externally, without copying tools into the generated project. Keep it in an available persistent terminal/session, verify the actual HTTP URL and required local assets, and open the URL with browser tools when available. Inspect DOM/layout, runtime errors and loading/data states; an HTTP 200 proves serving, not browser rendering or a successful SeaTable read. Preview does not require screenshots.

Use only an available port and permitted localhost access. Do not change firewall/proxy settings, kill unrelated processes, install extra preview dependencies or write screenshots into the project. If execution restrictions, missing assets or startup errors prevent preview, report the specific limitation and deliver source normally. If the environment cannot keep the service alive, say it stopped; do not return a dead URL as running.

## Shared static configuration, mode-specific path

Both modes use the same **assets/setting.template.js** and only server/appUuid/pageId/accountToken as top-level strings:

| Mode | Private configuration file |
| --- | --- |
| Single-file HTML | Project-root **setting.js** |
| Vite ESM-only | **src/setting.js** |

```js
export default {
  server: '',
  appUuid: '',
  pageId: '',
  accountToken: '',
};
```

Setup and live preview reject the other mode's input even when the intended file is absent, including two coexisting inputs. Keep only the matching configuration path; never select/copy credentials automatically. No old-format detection, reading or migration is provided.

The user edits the matching setting.js, not generated JSON; preview never regenerates/overwrites it. Preview reads it directly; do not generate intermediate configuration exports or additional credential files. Settings must be a static ESM default-export object with literal string values; comments, single/double quotes and trailing commas are accepted. No imports, functions, template-string/process.env expressions or executable code: validation/deployment token scanning parse without executing the file. Invalid settings fail safely, not silently. Single-file index.html need not become an ESM page or import setting.js: the preview tool reads the static object and injects the development context.

Neither file is committed, bundled, served directly or deployed. When Git is used, the file must be both ignored and untracked; ignore rules do not remove tracked secrets. For committed tokens, stop and advise revocation/rotation and user-managed history cleanup.

Copy server/appUuid/pageId from the target HTML page's **HTML page development information**. The page must exist for pageId to be available. Preserve the complete service path, not just a domain. accountToken is an API token created in the Base, not a password/runtime accessToken. Switching Bases requires its appropriate token.

After consent:

```sh
node <skill-root>/scripts/setup-local.mjs --project <project-root> --mode single
# Vite: use --mode vite to initialize src/setting.js from the same template.
```

The tool prepares files/ignores only; the agent opens the matching file separately. It does not create an App, page, API token or table.

## Single-file preview

```sh
node <skill-root>/scripts/preview.mjs --project <project-root> --mode single
```

Node is required; npm/Vite is not. The localhost-only service statically parses root setting.js, serves only allowlisted files and temporarily injects an escaped window.__HTML_PAGE_DEV_CONFIG__ into index.html, leaving source unchanged. Without a manifest it serves only index.html; extra relative assets need an explicit optional list. Credential files are never routes. No ZIP is created.

This is not a generic proxy. For CORS/network failures inspect development access; use an agreed restricted proxy or ESM-only Vite migration if needed, never disabled browser security or fabricated grants.

## Vite preview

New projects first follow [Normalized Vite implementation](vite-project.md): root src, no ESM switch or src/esm/classic branches. Reuse project dependencies/config; do not install automatically when missing.

```sh
node <skill-root>/scripts/preview.mjs --project <project-root> --mode vite
```

The tool reads src/setting.js directly, starts project-local Vite in development and does not write the settings. The normalized project's serve-only plugin, defined entirely in vite.config.js, also supports npm run dev, re-reading settings for HTML/full reloads. The extra preview plugin recognizes the same escaped context (or normalizes a verified older template injection); stop for incompatible duplicate context instead of layering instances.

Both paths bind locally and deny direct file access to setting.js, .seatable and environment files. The browser receives credentials via the escaped HTML context, not an import. Production builds do not read/inject settings, even when build mode is development. `vite preview` serves production output and is not this connected development workflow; do not use it as an alternative Skill preview path.

A normalized Vite project supports independent live development through npm run dev after consent/settings completion; all project-side logic stays in vite.config.js. Do not copy dev-config.mjs, vite-dev-plugin.mjs or Skill preview runners into it. Normally invoke the Skill tools externally for either mode. Keep Node lint globals scoped to config/tool files; no preview-only installation before consent.

## Initialization and page changes

```js
const config = window.__HTML_PAGE_DEV_CONFIG__ || null;
const sdk = new HTMLPageSDK(config ? { ...config } : null);
await sdk.init();
```

Validate all four fields of a present development object; reuse assets/sdk-data.js and one shared init. Browser/UI modules never read the settings file/token separately. Production receives host context.

After editing the mode-specific file, stop/restart preview and fully refresh. Do not mutate active SDK options. The normalized Vite plugin can trigger full reloads, but a manual restart is a reliable connection-switch procedure. Named multi-target/environment selection is not provided.

## Preview screenshots (both modes)

Preview does not require capture. Follow the [preview screenshot rules](validation.md#preview-screenshots-both-page-types): inspect DOM/runtime evidence first, and keep any necessary, limited capture outside the page project and upload ZIP.

## Verification and packaging boundaries

- Local binding, permissions/ignores and blocked routes do not hide tokens from the browser; use trusted browsers/dependencies, never expose to LAN/public internet. A token-free browser needs a separate server-side proxy design.
- Starting either service makes no SeaTable requests itself. Executing connected page code accesses real data; configuration is not permission to access arbitrary tables or mutate them.
- SDK init resolving is not proof of authorization; initialization may catch authentication errors without rejecting. Use the shared [SDK version](sdk-version.md). Verify a small authorized read (e.g. limit=1), not private SDK properties.
- Distinguish configuration/loading/read success/network/permission errors. Do not show raw exceptions/headers or call every failure an invalid token. Local token grants may differ from visitors; host acceptance still matters.
- Writes/uploads/publishing need separate authorization. No generation/preview tests directory or page-zip/ZIP by default; later packaging is a separate chat request and needs no credentials.
- On existing production output, run check-page.py <dist-or-zip> --project <project-root>. It reads the static root setting.js or src/setting.js token and matches literal/JSON-escaped forms without executing JS; absent credentials are allowed. It detects common leaks, not every transformed/encrypted secret. Refuse archives with credentials, settings, development injection, node_modules or unrelated source.
