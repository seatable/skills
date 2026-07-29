---
name: seatable
description: SeaTable API for managing tables/rows in a single SeaTable base. Use whenever the user wants to create/rename/delete a table or column, read, search, add, update, or delete rows/records in a SeaTable base, run SQL-like queries against a base, upload files/images into a row, or otherwise interact with SeaTable data.
---

# SeaTable Skill

Use the SeaTable API to search/read/update rows in a single SeaTable base.
API Reference: https://api.seatable.com/reference/introduction
Developer Manual: https://developer.seatable.com/

> This skill uses the current `/api-gateway/api/v2/` endpoints. SeaTable removed the legacy `dtable-server`/`dtable-db` (`/api/v1/...`) endpoints in version 5.3. Do not use those legacy paths.

## Setup

```bash
mkdir -p ~/.config/seatable
echo "https://your-seatable.example.com" > ~/.config/seatable/server
echo "your_base_api_token_here"          > ~/.config/seatable/api_token
```

Load these values before use:
```bash
SEATABLE_SERVER=$(cat ~/.config/seatable/server)
SEATABLE_API_TOKEN=$(cat ~/.config/seatable/api_token)
```

If the configuration files do not exist, ask the user to provide both values.

To obtain a Base API Token, open the target base in the web interface, select the context menu or top menu, then choose Advanced → API Token → Generate Token. The token is scoped to that base and uses the selected read/write permissions.

## Authentication and Two-Level Tokens

SeaTable's base-level API uses a two-step authentication flow:

1. Exchange the long-lived **API-Token** stored in the configuration file for a **Base-Token**:

```bash
curl -s -H "Authorization: Token $SEATABLE_API_TOKEN" \
  "$SEATABLE_SERVER/api/v2.1/dtable/app-access-token/"
```

Example response:
```json
{
  "app_name": "my-app",
  "access_token": "eyJhbGciOi...",
  "dtable_uuid": "5a40dd8e-59b7-49ff-84a7-3c9fb8a0cf60",
  "workspace_id": 1,
  "dtable_name": "my-base"
}
```
The response's `access_token` field is the **Base-Token**, as named in the official documentation. `dtable_uuid` is equivalent to `base_uuid`. Older responses may also contain `dtable_server` and `dtable_db`, but SeaTable 5.3+ no longer requires them. Send every request to `$SEATABLE_SERVER/api-gateway/api/v2/dtables/{base_uuid}/...`; do not construct URLs from those legacy fields.

2. Use this **Base-Token** as the `Authorization: Token` value for all subsequent base operations. Use this URL pattern:
```
$SEATABLE_SERVER/api-gateway/api/v2/dtables/$DTABLE_UUID/<resource>/
```

A **Base-Token is valid for three days**. It is a JWT and must be exchanged again after expiration. Do not cache it long-term; obtain a fresh token before a batch of operations.

## Example Conventions

Names such as `Table1`, column names, and `row_id` are placeholders. Replace them with the user's actual table name, column name, and row ID.

## Core Operations

First obtain a Base-Token and save the variables used by subsequent commands:

```bash
RESP=$(curl -s -H "Authorization: Token $SEATABLE_API_TOKEN" \
  "$SEATABLE_SERVER/api/v2.1/dtable/app-access-token/")

ACCESS_TOKEN=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
DTABLE_UUID=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['dtable_uuid'])")
WORKSPACE_ID=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['workspace_id'])")
BASE_API="$SEATABLE_SERVER/api-gateway/api/v2/dtables/$DTABLE_UUID"
```

### Get Base Metadata (Tables, Columns, and Views)

```bash
curl -s -H "Authorization: Token $ACCESS_TOKEN" \
  "$BASE_API/metadata/"
```

### List Rows in a Table

```bash
curl -s -H "Authorization: Token $ACCESS_TOKEN" \
  "$BASE_API/rows/?table_name=Table1&convert_keys=true"
```
`convert_keys=true` makes returned rows use column names instead of internal column keys. Optionally add `&view_name=` to select a view, which returns only the columns visible in that view, or use the `start` and `limit` pagination parameters.

### Query and Modify Data with SQL

```bash
curl -s -X POST \
  -H "Authorization: Token $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT * FROM Table1 WHERE Name = '\''Tom'\''", "convert_keys": true}' \
  "$BASE_API/sql/"
```
This endpoint supports `SELECT`, `UPDATE`, and `DELETE`. `INSERT` is available only for bases with Big Data storage enabled; use the append-rows endpoint for standard storage. SQL syntax is case-insensitive and supports common functions such as `now()`, `round()`, and `upper()`. Some functions use SeaTable-specific names, such as `concatenate()` instead of `CONCAT()`. The default maximum is 100 returned rows; add `LIMIT` to the SQL when more results are needed.

### Append One or More Rows

```bash
curl -s -X POST \
  -H "Authorization: Token $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
        "table_name": "Table1",
        "rows": [{"Name": "Tom", "Age": 18}],
        "apply_default": false
      }' \
  "$BASE_API/rows/"
```
- `rows` must be an array, even when appending only one row.
- `apply_default` controls whether omitted columns receive their configured default values. It defaults to `false`.
- The request body must use column names, such as `Name`, rather than internal column keys.

### Update One or More Rows

```bash
curl -s -X PUT \
  -H "Authorization: Token $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
        "table_name": "Table1",
        "updates": [
          {"row_id": "<ROW_ID>", "row": {"Age": 19}}
        ]
      }' \
  "$BASE_API/rows/"
```
`updates` must be an array, even when updating only one row.

### Delete One or More Rows

```bash
curl -s -X DELETE \
  -H "Authorization: Token $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"table_name": "Table1", "row_ids": ["<ROW_ID_1>", "<ROW_ID_2>"]}' \
  "$BASE_API/rows/"
```
For a single deletion, pass `row_ids` as an array containing one element.

### Create a Table

```bash
curl -s -X POST \
  -H "Authorization: Token $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
        "table_name": "Table2",
        "lang": "en",
        "columns": [
          {"column_name": "Name", "column_type": "text"},
          {"column_name": "Age", "column_type": "number"}
        ]
      }' \
  "$BASE_API/tables/"
```
- `table_name` is required and must not duplicate an existing table name.
- `lang` is optional and accepts `en` (default) or `zh-cn`. It determines the language of the automatically generated primary column only when `columns` is omitted.
- `columns` is optional and predefines the columns. The first column may use only `text`, `number`, `date`, `single-select`, `formula`, or `autonumber`. Omitting `columns` creates an empty table with the default primary column.
- A newly created table includes a default view named `Default View`.

### Rename, Delete, or Duplicate a Table

```bash
# Rename
curl -s -X PUT \
  -H "Authorization: Token $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"table_name": "Table2", "new_table_name": "Customer Information"}' \
  "$BASE_API/tables/"

# Delete
curl -s -X DELETE \
  -H "Authorization: Token $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"table_name": "Table2"}' \
  "$BASE_API/tables/"

# Duplicate, including records
curl -s -X POST \
  -H "Authorization: Token $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"table_name": "Table2", "is_duplicate_records": true}' \
  "$BASE_API/tables/duplicate-table/"
```
SeaTable automatically adds `(copy)` to the duplicated table's name. To use a specific name, rename the table after duplication.
Deleting a table is irreversible. Confirm the exact table name and its data with the user before proceeding.

### Add or Delete Columns

```bash
# Add one column
curl -s -X POST \
  -H "Authorization: Token $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"table_name": "Table2", "column_name": "Email", "column_type": "text"}' \
  "$BASE_API/columns/"

# Add multiple columns
curl -s -X POST \
  -H "Authorization: Token $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"table_name": "Table2", "columns": [
        {"column_name": "Phone", "column_type": "text"},
        {"column_name": "Birthday", "column_type": "date"}
      ]}' \
  "$BASE_API/batch-append-columns/"

# Delete a column by name or column key
curl -s -X DELETE \
  -H "Authorization: Token $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"table_name": "Table2", "column": "Email"}' \
  "$BASE_API/columns/"
```
Common `column_type` values include `text`, `number`, `date`, `single-select`, `multiple-select`, `checkbox`, `long-text`, `image`, `file`, `link`, `formula`, and `geolocation`. Single-select and multiple-select columns also require `column_data.options`. `batch-append-columns` does not support `formula`, `link`, or `link-formula`; add those types individually through the single-column endpoint.

### Upload a File to a File or Image Column

> File uploads use the separate dtable-web endpoint and the long-lived **API-Token**, not the Base-Token. This differs from other base operations and is explicitly documented by SeaTable. An upload link remains valid for only a few minutes, so obtain a fresh one before each upload.

```bash
# 1. Get an upload link with the API-Token from SEATABLE_SERVER
UPLOAD_INFO=$(curl -s -H "Authorization: Token $SEATABLE_API_TOKEN" \
  "$SEATABLE_SERVER/api/v2.1/dtable/app-upload-link/")
UPLOAD_URL=$(echo "$UPLOAD_INFO" | python3 -c "import sys,json; print(json.load(sys.stdin)['upload_link'])")
PARENT_PATH=$(echo "$UPLOAD_INFO" | python3 -c "import sys,json; print(json.load(sys.stdin)['parent_path'])")
FILE_TYPE="file"  # Use "image" for an image column
RELATIVE_PATH="${FILE_TYPE}s/$(date +%Y-%m)"

# 2. Upload the file
curl -s -X POST "$UPLOAD_URL?ret-json=1" \
  -H "Authorization: Token $SEATABLE_API_TOKEN" \
  -F "file=@/local/photo.jpg" \
  -F "parent_dir=$PARENT_PATH" \
  -F "relative_path=$RELATIVE_PATH" \
  -F "replace=1"

# 3. Construct the attachment object shown below; do not write the raw response
```

Do not write the raw upload response directly to the column. Convert each uploaded item to a SeaTable attachment object and write it as an array element:

```json
{"type": "file", "size": 12345, "name": "example.pdf", "url": "https://seatable.example.com/workspace/<workspace_id>/asset/<dtable_uuid>/files/2026-07/example.pdf"}
```

Use `type: "file"` for a file column and `type: "image"` for an image column. The `RELATIVE_PATH` sent during upload and the path after `<dtable_uuid>/` in `url` must be exactly the same; URL-encode the final server-returned file name. Update the row with `{"Column Name": [attachment]}` and include existing attachment objects when appending instead of replacing them.

Reading the row back verifies only that the attachment record was written. To verify the asset itself, request `/api/v2.1/dtable/app-download-link/` with the API-Token and the asset path after `<dtable_uuid>/`, download the returned link, and confirm the expected file size or content. A direct asset URL may return login or error HTML with HTTP 200, so status code alone is not sufficient.

## Python Helper

Prefer the official `seatable-api` library (`pip install seatable-api --break-system-packages`). It handles api-gateway endpoint details internally and is simpler than maintaining custom requests code:

```python
from seatable_api import Base
from seatable_api.constants import ColumnTypes

def get_base(server_url, api_token):
    base = Base(api_token, server_url)
    base.auth()
    return base

base = get_base(SEATABLE_SERVER, SEATABLE_API_TOKEN)

# List rows
rows = base.list_rows("Table1")

# Query or modify data with SQL
result = base.query("SELECT * FROM Table1 WHERE Name = 'Tom' LIMIT 50")

# Append a row
base.append_row("Table1", {"Name": "Tom", "Age": 18})

# Update a row
base.update_row("Table1", row_id, {"Age": 19})

# Delete a row
base.delete_row("Table1", row_id)

# Batch append, update, or delete rows
base.batch_append_rows("Table1", [{"Name": "A"}, {"Name": "B"}])
base.batch_update_rows("Table1", [{"row_id": row_id, "row": {"Age": 20}}])
base.batch_delete_rows("Table1", [row_id_1, row_id_2])

# Create a table
columns = [{"column_type": "text", "column_name": "Name"}, {"column_type": "number", "column_name": "Age"}]
new_table = base.add_table("Table2", lang="en", columns=columns)

# Rename or delete a table
base.rename_table("Table2", "Customer Information")
base.delete_table("Customer Information")

# Add a column to an existing table
base.insert_column("Table1", "Email", ColumnTypes.TEXT)

# Upload a local file to a file column
file_info = base.upload_local_file("/local/photo.jpg", "photo.jpg", file_type="file")
base.update_row("Table1", row_id, {"Photo": [file_info]})
```

If `seatable-api` is unavailable and cannot be installed, fall back to custom requests using the current api-gateway endpoints. Follow the two-step authentication flow: first exchange the API-Token for a Base-Token, then call `$SEATABLE_SERVER/api-gateway/api/v2/dtables/{uuid}/...`:

```python
import requests

class BaseClient:
    def __init__(self, server: str, api_token: str):
        self.server = server.rstrip("/")
        self.api_token = api_token
        self._refresh_access()

    def _refresh_access(self):
        r = requests.get(f"{self.server}/api/v2.1/dtable/app-access-token/",
                          headers={"Authorization": f"Token {self.api_token}"})
        r.raise_for_status()
        info = r.json()
        self.access_token = info["access_token"]
        self.dtable_uuid = info["dtable_uuid"]
        self.base_api = f"{self.server}/api-gateway/api/v2/dtables/{self.dtable_uuid}"

    @property
    def _headers(self):
        return {"Authorization": f"Token {self.access_token}", "Content-Type": "application/json"}

    def list_rows(self, table_name):
        r = requests.get(f"{self.base_api}/rows/",
                          headers=self._headers,
                          params={"table_name": table_name, "convert_keys": True})
        r.raise_for_status()
        return r.json()["rows"]

    def query(self, sql, convert_keys=True):
        r = requests.post(f"{self.base_api}/sql/",
                           headers=self._headers,
                           json={"sql": sql, "convert_keys": convert_keys})
        r.raise_for_status()
        return r.json()["results"]

    def append_rows(self, table_name, rows: list, apply_default=False):
        r = requests.post(f"{self.base_api}/rows/",
                           headers=self._headers,
                           json={"table_name": table_name, "rows": rows, "apply_default": apply_default})
        r.raise_for_status()
        return r.json()

    def update_row(self, table_name, row_id, row: dict):
        r = requests.put(f"{self.base_api}/rows/",
                          headers=self._headers,
                          json={"table_name": table_name,
                                "updates": [{"row_id": row_id, "row": row}]})
        r.raise_for_status()

    def delete_rows(self, table_name, row_ids: list):
        r = requests.delete(f"{self.base_api}/rows/",
                             headers=self._headers,
                             json={"table_name": table_name, "row_ids": row_ids})
        r.raise_for_status()
```

Example usage:
```python
client = BaseClient(server=SEATABLE_SERVER, api_token=SEATABLE_API_TOKEN)

for row in client.list_rows("Table1")[:5]:
    print(row)

for row in client.query("SELECT * FROM Table1 WHERE Age > 10 LIMIT 20"):
    print(row)

client.append_rows("Table1", [{"Name": "Alice", "Age": 20}])
```

## Important Notes

- **API-Token and Base-Token are different.** The API-Token is long-lived and stored in the configuration. The Base-Token is a JWT valid for **three days**. Exchange it again after expiration and do not reuse it as a long-term cached credential.
- **Always use the current `/api-gateway/api/v2/dtables/{base_uuid}/...` endpoints.** Do not use legacy `dtable-server`/`dtable-db` (`/api/v1/...`) paths. SeaTable removed them in version 5.3, and they return 404.
- `table_name` is case-sensitive and must exactly match the name in the base.
- Updating or deleting a row requires its `row_id`. Obtain it from the `_id` field returned by `list_rows` or an SQL query.
- The append-rows request body uses a `rows` array, and the delete-rows request body uses a `row_ids` array, even for a single row.
- An upload link is single-use and valid for only a few minutes. Obtain a new link before every upload. File upload uses the API-Token rather than the Base-Token as an exception in the official API design.
- Write operations require a Base API Token with write permission selected when the token is generated.
- When creating a table with `columns`, the first column may use only `text`, `number`, `date`, `single-select`, `formula`, or `autonumber`. Table deletion cannot be undone, so confirm the exact name before proceeding.
- `batch-append-columns` does not support `formula`, `link`, or `link-formula`. Add those column types one at a time through the single-column endpoint.
