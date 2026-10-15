# API Selection, Exact Parameters, and Return Values

Core contracts were rechecked against the public Rows, Files & Images, and Low-code pages on 2026-10-10. Use official documentation for API contracts and the target project's published SDK for capability checks. Typed-cell, error-handling and workflow guidance is included here and in the linked local references; no private source is required. Use the shared [SDK version](sdk-version.md); see [Source boundaries](documentation.md) for contract verification. Read [Conditional SDK extensions](sdk-extensions.md) only when query/user/link/action methods are needed; do not infer their availability from these local rules alone.

## Core operation matrix

Here, result is the value returned by `await sdk.method(...)`. Names are case-sensitive.

| Method | Parameter object | Result to read |
| --- | --- | --- |
| listRows | `{ tableName, start, limit }` | `result.data.results` row array; `result.data.metadata` field metadata |
| addRow | `{ tableName, rowData }` | `result.data.row` new row, including its `_id` |
| batchAddRows | `{ tableName, rowsData }` | `result.data.rows` created rows and their `_id` values |
| updateRow | `{ tableName, rowId, rowData }` | `result.data.success` and `result.data.row` |
| batchUpdateRows | `{ tableName, rowsData }`, each item `{ row_id, row }` | `result.data.success` and `result.data.rows` |
| deleteRow | `{ tableName, rowId }` | `result.data.success` |
| batchDeleteRows | `{ tableName, rowsIds }` | `result.data.success` |
| uploadFile | `{ file }`, a browser File | Direct `{ name, size, type, url }`, no `.data` |
| uploadImage | `{ file }`, a browser File | Direct `{ name, size, type, url }`, with image type |

Do not interchange batch-add row objects, batch-update `{row_id,row}` items, or batch-delete `rowsIds`. Use the returned `rows` for created records; do not require an additional `inserted_row_count` field to determine success.

## Raw reads, view data, and write DTOs

Keep these three representations separate:
1. **Raw reads:** `{ data: { metadata, results } }`. Cell values use column keys; each row has `_id`. Metadata includes `key/name/type`, `data` (configuration object or `null`), and may include `table_id/table_name`. Separately supplied metadata and row arrays are these two parts, not field-name-keyed rows or a write DTO.
2. **View data:** map each table's metadata key to its exact field name, preserving `_id`, typed values, and canonical system keys. Equivalent repeated descriptors are idempotent; conflicting descriptors or ambiguous output names must fail rather than overwrite a value. Never reuse one table's field-key map for another table. Do not hardcode real field keys.
3. **Write DTOs:** field-name-keyed `rowData` (or batch-update `row`), containing only the intended writable fields and respecting explicitly known restrictions. Do not submit a complete read row with `_id`, computed fields, system properties, or unrelated columns.

Reuse `assets/sdk-data.js` for non-destructive mapping and bounded pagination. Inline without exports in single-file HTML; import in Vite. Use bracket notation for exact non-English names and names containing spaces. Formatting belongs in the display layer; write serialization depends on the confirmed field type. SeaTable enforces actual access; show permission errors without bypasses or mock fallback. Generating SDK calls does not require parsing platform permission configuration or proving visitor access.

### Metadata and system keys

Treat metadata as configuration, not cell data. Keep relevant `data` members for display/serialization decisions; do not fill missing cells from `default_value`, calculate formulas, or round/reformat returned numbers/dates in the mapper. Compare repeated descriptors by content, ignoring object-member order but not array order or differences in type/configuration/table context.

Preserve returned `_id`, `_ctime`, `_mtime`, `_creator`, `_last_modifier`, `_archived`, `_locked` and other `_`-prefixed properties under their raw keys. When system metadata provides a display name, expose that alias too: `{key:'_ctime',name:'创建时间'}` retains both `_ctime` and `创建时间` with the same value. `_id` is always `_id`, even if its metadata has another name. Do not synthesize absent cells. Reject collisions between aliases, canonical keys and unmapped properties instead of silently selecting one.

### Use write responses, not optimistic assumptions

- Creation: take the new ID from the returned row, not from a client-generated business reference, list index, or guessed identifier.
- Updates: check success and apply returned rows by `_id`, not response-array position. Retain fields absent from a partial response. If its key/name format cannot be established, re-read the record scope rather than guessing a generic normalizer.
- A write response does not necessarily include metadata or a full record with the same shape as `listRows`. Do not feed it into the read normalizer without a verified field map/format.
- Deletion: remove the target from local state only after confirmed success. After a successful write, a failed refresh is a refresh failure, not permission to retry the write.
- A network failure after submission can leave the outcome unknown. Avoid automatic retries that duplicate creates/uploads/actions. Prevent duplicate clicks while a mutation is pending.

## Typed cells: read and write are not interchangeable

| Field | Raw/display handling | Write handling |
| --- | --- | --- |
| Single-/multiple-select | Option names, not internal option IDs; retain scalar/array types | Use confirmed option names and the target field's scalar/array shape |
| Link | Verified SDK samples use `[{row_id, display_value}]`; display_value may itself be structured | Target record ID arrays, including `[rowId]` for one link; distinguish replacing a field from incremental link APIs |
| File | Keep file-object arrays, including returned extra members such as `upload_time`; display safe names/URLs | Use upload file information (`name/size/type/url`); retain existing entries only when appending, without inventing extra write parameters |
| Image | Preserve URL arrays, subject to host image-display restrictions | `[imageInfo.url]`, not `[imageInfo]` |
| Number / rate / duration | Retain numbers, including zero; duration uses numeric seconds. Precision, currency/rating and duration formats affect display, not the raw value | Respect confirmed write units/types; do not submit formatted labels |
| Date / auto-number | Retain returned strings/null; auto-number strings can contain leading zeros. Date format does not change the returned representation | Serialize writable dates per the target contract; auto-number is generated, not a text input |
| Collaborator/user | Keep identifiers; resolve names/avatars separately | Original identifiers, not display names; see the conditional user reference |
| Geolocation | Structured object; display according to `column.data.geo_format` | Confirm the configured shape; never implicitly stringify the object |
| Digital signature (`digital-sign`) | Preserve `{sign_image_url,sign_time,username}`, `{}` or `null`; render empty signatures safely | Read samples do not establish signature-write support; confirm a dedicated contract before offering input |
| Department (`department-single-select`) | Preserve numeric department IDs or `null`, not fabricated names; resolve labels separately if supported | Do not infer a write API/shape or permission from the read value |
| Formula / lookup (`formula` / `link-formula`) | Use `data.result_type`, and `array_type/array_data` for arrays. Preserve scalar text/number/date/null or typed arrays, including files, images, signatures and department IDs; a lookup is not always an array | Computed fields are read-only; no client-side recomputation or write-back |
| System / generated / button | Keep returned system values. A `button` cell can be `null`; it is not an action specification | Do not submit system/generated fields or invent an action API from a button column |

The public-doc baseline covers selects, link writes, files/images and duration. Richer read shapes above also reflect user-supplied metadata/row samples; they are local handling guidance, not proof that every deployment has the same shapes or corresponding write support. See [Sources](documentation.md) and [Extensions](sdk-extensions.md); verify ambiguous types through authorized metadata/samples. Preserve `0`, `false`, empty strings, empty arrays/objects, `null` and omitted cells as distinct states. Structured cells and formula arrays are not universally strings or flattenable lists.

## Pagination and business scope

A requested limit does not guarantee that many returned records. When reading all records, advance start by the **actual number received** and stop on an empty page, not a short page. Prefer explicit pagination for large tables and state whether statistics/filters cover the current page or the full accessible scope.

Add configurable page/row limits to full reads. At the safety limit, fail or switch to explicit pagination rather than silently presenting incomplete results. A mid-pagination error must not turn partial data into a supposedly complete dataset.

`listRows` does not accept invented filters, sorting or SQL. Filter rows already fetched within their stated scope; use a supported query API when appropriate and handle its authorization failures separately from read access. Read related tables separately and index records by extracted link `row_id` values, not link objects themselves. Batch methods do not establish cross-table transactions.

## Uploading is not the final write

```js
const fileInfo = await sdk.uploadFile({ file });
await sdk.updateRow({
  tableName,
  rowId,
  rowData: { [fileFieldName]: [fileInfo] }
});

const imageInfo = await sdk.uploadImage({ file });
await sdk.updateRow({
  tableName,
  rowId,
  rowData: { [imageFieldName]: [imageInfo.url] }
});
```

Variables come from the confirmed schema/operations or runtime selection. Clarify append versus replace. Upload success followed by a failed row write is partial success, not saved data; retain the upload result and do not blindly upload again. Upload support does not authorize bypassing Base-image restrictions.

## Multi-step linked writes

Determine which table owns the writable link field and which record IDs are needed. Create the necessary records first, then link from the confirmed owner; do not impose a universal parent-first or child-first sequence.

For a parent-owned link, one valid sequence is `batchAddRows(details)` -> returned detail `_id` values -> `addRow(parent)` with that link field. If details own the link, creating the parent first can be appropriate. Neither sequence is a verified atomic transaction. On later-step failure, explain completed writes and offer a confirmed recovery; do not delete data or replay earlier writes automatically. Clearing links via an empty array requires verification against the target backend; mock success is not proof.
