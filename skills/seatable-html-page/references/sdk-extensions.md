# Conditional SDK Extensions

Read only for a page requiring these capabilities. Official API pages are the primary contract; the rules below are self-contained guidance, not proof of current method availability or deployment support. Verify the target package as described in [Documentation](documentation.md); private repository access is not required.

## Capability gate

Confirm the target project's installed/pinned version and method availability to select APIs. Platform settings and proof of deployment access are not generation prerequisites; verify actual access only during authorized live checks and surface denied operations. Do not silently upgrade an existing project or move production to a testing channel. Use the shared [SDK version](sdk-version.md); official documentation/metadata labels alone do not prove a method exists or a target deployment supports it. Do not fabricate methods in a mock to hide a missing production capability.

## Query

```js
const res = await sdk.queryRows({ tableName, conditions, start, limit });
const metadata = res.data.metadata;
const rawRows = res.data.results;
```

- `conditions` is a nonempty array of `{columnName, value}` using confirmed field names, not keys. Conditions are AND-combined; matching mode is server-configured. Do not invent operator/OR/SQL/filter arguments.
- Query authorization is server-enforced and independent of read access. Use the confirmed business condition/result fields and respect any explicitly known restrictions. A denied query is an error, not a reason to fetch broader data to bypass it; no permission-configuration parsing is required.
- Metadata may contain only result columns, not condition columns. Keep filter definitions from the confirmed requirements rather than assuming the filter field is in the returned metadata.
- Saved query guidance uses a limit cap of 500, date-query values `YYYY-MM-DD`, and multi-select-query values as arrays. Verify these constraints against the target contract before use.
- Prefer query for search/lookup when supported and suitable for the workflow. Client-side filtering is appropriate for rows already listed, with an explicit data scope; read permission does not imply query permission or vice versa.
- `createDataAccess.queryPage` parses the read envelope and rejects a missing method. It does not grant permissions, determine matching semantics, or provide a query emulator.

## Users

| Method | Parameters | Read |
| --- | --- | --- |
| getCurrentUser | No arguments | `res.data` profile, including name/username/avatar_url/user_id |
| listCollaborators | No arguments | `res.data.collaborator_list` |
| resolveUsers | `{userIds}` | `res.data.user_list` |

Use current-user name (fallback username) and avatar for personalization. `user_id` is not a record `_id`; getCurrentUser is not a collaborator selection API. Treat the `email` field of collaborator/resolved-user records as the identifier used by these APIs, not proof that it is an arbitrary external email address.

For user cells, collect identifiers, merge collaborator candidates with resolveUsers results into an identifier-keyed map, and use that same merged map for **both display and selection controls**. Write the original identifiers, not resolved names. For creator/modifier values, use returned `_creator`/`_last_modifier` identifiers with confirmed creator/modifier cells as fallback; preserve raw `_creator`/`_last_modifier` keys even when metadata supplies display aliases, and leave creator/modifier fields read-only. Missing users need a clear fallback, not a fabricated identity.

## Incremental links

| Method | Parameters | Read |
| --- | --- | --- |
| addLink / deleteLink | `{tableName,rowId,linkColumnName,otherRowId}` | `res.data.success`, `res.data.row` |
| batchAddLinks / batchDeleteLinks | `{tableName,linksData}` | `res.data.success`, `res.data.rows` |

Each linksData item is `{row_id, links: { [actualLinkFieldName]: [targetIds] }}`. SDK boundary parameters use camelCase; batch item `row_id` is snake_case. These operations require update access at runtime; handle denial without bypassing it. Use display names, not table/column IDs. These add/remove relationships incrementally, unlike replacing a row's link field. Apply returned rows by `_id`, respecting partial response/key-format caveats in the core reference. Never infer atomicity or verified empty-array clearing from a mock.

## Actions and asynchronous tasks

Use methods available in the selected SDK and confirm the business inputs below, including account/script names where required; do not request platform resource IDs or permission JSON merely to generate code. Actual action execution needs explicit user authorization for the target/recipients and resources, and access is enforced by SeaTable independently of CRUD. Missing settings are not evidence that an action is disabled. If a restriction is explicitly known, explain the conflict rather than bypassing it or claiming the action works.

| Method | Parameters | Read |
| --- | --- | --- |
| sendNotification | `{tableName,rowId,emails,msg}` | `res.data.task_id` |
| sendEmail | `{accountName,tableName,rowId,sendTo,copyTo,replyTo,subject,message,htmlMessage,attachmentColumnNames}` (omit unused optional fields) | `res.data.task_id` |
| getMessageStatus | `{taskId}` | `res.data.is_finished` |
| runScript | `{scriptName,tableName,rowId}` | `res.data.task_id` |
| getScriptResult | `{scriptName,taskId}` | **`res.data.script`** |

- Notifications and email are associated with one row: supply its confirmed tableName and `_id` as rowId. Notification `emails` are SeaTable user identifiers from confirmed selections/user cells; `msg` is the documented parameter. This is an in-app notification, not arbitrary Internet email.
- Email uses a configured account **name** and confirmed recipients. `replyTo` is a string. Provide **exactly one** of `message` or `htmlMessage`; attachments use FILE column **names**, not keys. Follow the verified table/row context requirements; plain subjects are not HTML.
- Scripts use the displayed configured script name, not a script ID/file path. Provide tableName and rowId together or omit both. Do not invent args/data wrappers.
- Start polling only after receiving the corresponding task ID. Distinguish submitted, pending, finished, failed and client timeout. Use bounded polling, stop on page teardown, and never automatically re-send or re-run a task.
- `is_finished` indicates completion, not a separate undocumented delivery-success payload. If no success/error detail is documented, do not invent one or claim confirmed email delivery.
- Script results are under `.data.script`, not `.data` directly. Check state/success/return_code; `success:false` or a nonzero return_code means failure. Render output as plain text. Hide internal IDs/private fields unless needed.

## Structured geolocation

Saved `column.data.geo_format` guidance includes province; province_city; province_city_district; geolocation (detail); country_region; lng_lat `{lng,lat}`; map_selection `{address,lngLat:{lng,lat},tag:[],title}`. Administrative objects can have `province/city/district/detail` members, with some omitted; preserve the members actually returned, not a fixed subset. Map samples may include `tag/title`; retain them without inventing required values. Use the confirmed format and actual metadata/sample, not one universal location shape. Guard nulls, keep empty objects distinct and preserve numeric coordinates. Display formatting is separate from write serialization; a read object does not by itself establish a writable shape. Never implicitly convert locations to JSON strings.
