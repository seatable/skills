# SDK-shaped Sample Data Before Live Connection

Use this reference after the business schema is confirmed and local simulation is useful. Sample data does not establish real table existence, permissions, API availability or successful writes. Missing schema still requires clarification; an explicitly requested visual prototype remains disconnected.

## Use response samples, not a simulated SDK

Prepare only the synthetic responses needed by the page. Keep the SDK's response envelope and typed values, then pass them through the same parser, field-key mapping, business calculations and rendering used for real reads. Do not maintain a second name-keyed dataset just for the UI.

The Skill provides no mock SDK. Do not generate a replacement SDK facade, stateful CRUD/relationship engine, permission emulator or SDK-factory injection merely to display sample data. A temporary fixture-loading function is enough; production data access continues to use the real SDK.

Illustrative read sample (not a default business schema):

```js
const sampleResponse = {
  data: {
    metadata: [
      { key: 'a8Qm', name: 'Customer name', type: 'text' },
      { key: 'b2Vn', name: 'Status', type: 'single-select',
        data: { options: [{ name: 'In progress' }, { name: 'Completed' }] } }
    ],
    results: [{ _id: 'Gm8Rk2VqT5aPz7NwY1cH9Q', a8Qm: 'Sample customer', b2Vn: 'In progress' }]
  }
};
const { metadata, results } = sampleResponse.data;
const rows = normalizeRows(metadata, results);
// Feed rows into the page's existing calculations/rendering.
```

Use `normalizeRows` from `assets/sdk-data.js` (inline without exports for single-file checks). Reuse a page's existing response parser when it has one. Synthetic keys/IDs are fixture details, not hardcoded production selectors. Each table has its own mapping; use only confirmed fields, options and relationships. Do not copy the example's schema into an unconfirmed Base or copy real records/private user data into fixtures.

## Types and focused scenarios

Keep files as file-object arrays (including extras such as `upload_time`), images as URL arrays, links as `{row_id,display_value}` objects, user cells as identifiers and select cells as option names. Preserve numeric department IDs, signature objects/empty objects/null, and format-specific geolocation objects, including administrative members or map `address/lngLat/tag/title`. Use formula/lookup `result_type`, `array_type` and `array_data`: a result may be scalar or a typed array, not always text or a flat string list.

Where relevant, include identical repeated `_ctime/_mtime` metadata and system descriptors alongside normal fields. Mapping must be idempotent, retain raw system keys plus confirmed display aliases, and never rename `_id`. Conflicting descriptors/output names must fail. Preserve `0`, `false`, empty strings/arrays/objects, `null` and omitted cells; do not apply metadata defaults, precision or formula calculations to manufacture sample values.

[The Skill's synthetic response fixture](../tests/fixtures/sdk-response.json) illustrates these shapes across 26 types, including `data: null` and richer field configuration. It is a Skill-owned regression example, not the user's schema, a universal type catalog or a file to copy into production projects. Select only confirmed, relevant shapes for page-specific samples.

Prepare only relevant examples: normal/empty results, multiple tables, structured or missing cells, and separate page responses when pagination matters. Loading/failure states can be exercised with a temporary delay or rejected request at the page's data-loading boundary, not a reusable mock SDK. Failures must stay failures, not complete totals or fake success.

For form/submission checks, inspect the intended field-name write DTO separately from read samples. If useful, provide a fixed partial write/upload response or before/after read sample with consistent IDs. Upload results are direct file information, not wrapped in `.data`; link/file/image writes still follow their verified shapes. Label any local submission result as simulated, not saved to SeaTable. Do not implement persistence, formula calculation, default filling, permission enforcement or automatic relationship updates to make fixtures behave like a backend.

Samples cover only the supplied shapes and exercised UI/business paths. They do not verify backend validation, permissions, actual pagination semantics, writes, transactions, link clearing or action delivery. Never upload files, send messages/emails or run real scripts during simulation, and do not treat an unavailable production API as supported because a sample exists.

## Mode and deployment boundary

Select sample data explicitly in a temporary check or development-only entry, before any real SDK initialization or data request, and label simulation visibly in the user's language. Sample execution itself needs no credentials, extra mock-settings JSON or generated tests. Page generation still follows the configuration-first prerequisite: both forms retain their previously configured root setting.js. Sample checks do not authorize business-data access.

- Vite: isolate sample data and its loading branch in a development-only entry/branch. Confirm production excludes them and uses the real SDK. Do not add a production URL toggle that enables fake submissions.
- Single-file: keep temporary sample checks outside the deliverable; the deployable index.html uses the real SDK. Do not permanently inline fixtures or a fallback into the production page. The existing preview tools inject live settings when authorized, not a built-in sample-data mode.
- On accepted live preview, switch to the real loading path and verify authorized reads. Missing configuration, SDK initialization, 403 and network failures must never fall back to sample data. Writes need separate confirmation.

Do not create test scaffolding, deploy-files.json or a ZIP merely to check samples, or start preview/capture screenshots without a corresponding request. Report sample-data, structure and build checks separately from real SeaTable verification.
