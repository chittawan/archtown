/**
 * Markdown served at GET /api/ai/context — optimized for LLM consumption.
 * Keep sections scannable: goal → auth → sync modes → data model → examples.
 */
export function buildAIContextMarkdown(baseUrl: string): string {
  return `# ArchTown — AI & API Context

## How to use this document (for AI agents)

1. **Purpose**: ArchTown is a React + SQLite (WASM) app. The **server** stores per-user JSON backups at \`data/sync/<userId>/backup.json\`. Your reliable read/write path is the **HTTP APIs** below (not the browser DB).
2. **Identify the user**: After token login you get \`googleId\`. Send it on every sync call as header \`X-Google-User-Id: <googleId>\`.
3. **Prefer incremental sync**: Use \`GET /api/sync/version\`, then \`PATCH /api/sync/patch\` with small op batches. Use \`POST /api/sync/upload\` for full backup replace or recovery.
4. **Errors**: Some JSON \`error\` strings are **Thai** in production code. Common mappings:
   - \`ยังไม่มีข้อมูลบน Cloud\` → no backup exists yet for that user (404).
   - \`Cloud มีข้อมูลใหม่กว่า\` → upload rejected: server has a newer \`version\` (409).
5. **Tables**: There are **10** tables in the sync payload (see § Data model). Respect foreign-style relationships when editing (parents before children on insert; children before parents on delete in one logical batch).

**Base URL**: \`${baseUrl}\`

---

## Quick reference — HTTP endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/token/generate | Issue an AI login token (admin) |
| POST | /api/auth/token/login | Exchange token → \`googleId\` |
| GET | /api/sync/version | Backup metadata: \`version\`, \`updated_at\` |
| GET | /api/sync/download | Full backup JSON |
| POST | /api/sync/upload | Full backup upload (optional \`?force=1\`) |
| PATCH | /api/sync/patch | Field-level / row ops (max 100 ops per request) |
| GET | /api/sync/events | SSE stream — real-time ops broadcast (\`text/event-stream\`) |
| GET | /api/audit | Audit log (query by date or table+id) |
| POST | /api/audit/undo/:req_id | Undo one PATCH request |
| GET | /api/ea/overview | Dashboard: all projects + EA week/snapshot counts + latest totals |
| GET | /api/ea/:projectId/summary | Web summary: weeks + latest snapshot totals per team |
| GET | /api/ea/:projectId/weeks | EA weekly definitions for a project |
| PUT | /api/ea/:projectId/weeks | Set week date ranges (\`{ "weeks": [{ week_no, label, start, end }] }\`) |
| POST | /api/ea/:projectId/snapshot | Take snapshot for \`week_no\` (body \`{ "week_no": number }\`) |
| GET | /api/ea/:projectId/history | Latest snapshot per \`week_no\` for charts (default); \`?all=1\` returns every file; \`total_files\` = on-disk count |
| GET | /api/ea/:projectId/history/:week_no | Latest snapshot for one week |
| GET | /api/ai/context | This document (Markdown) |

---

## 1. Authentication

ArchTown supports **Google OAuth** (browser) and **AI login tokens** (API).

**Recommended headers for sync (token path)**:
- \`X-Google-User-Id: <googleId>\`
- \`Authorization: Bearer <token>\` — enforces token **scope** and **per-token rate limits** where configured.

### POST /api/auth/token/generate

\`\`\`http
POST ${baseUrl}/api/auth/token/generate
Content-Type: application/json
X-Admin-Key: <required when ARCHTOWN_ADMIN_KEY is set>

{
  "googleId": "107508…4581",
  "expiresAt": "2026-12-31T23:59:59Z",
  "scope": "read"
}
\`\`\`

- \`scope\`: \`"read"\` | \`"write"\` (default \`"write"\` if omitted).
- \`expiresAt\`: ISO string or \`null\` for no expiry.

**200** — \`{ "ok": true, "token": "atkn_...", "googleId": "...", "expiresAt": "..." }\`  
**401** — \`{ "ok": false, "error": "unauthorized" }\`

Tokens are stored hashed (SHA-256); they cannot be recovered if lost.

### POST /api/auth/token/login

\`\`\`http
POST ${baseUrl}/api/auth/token/login
Content-Type: application/json

{ "token": "atkn_..." }
\`\`\`

**200** — \`{ "ok": true, "googleId": "...", "expiresAt": "..." | null, "scope": "read" | "write", "tokenId": "<id>" }\`  
- \`tokenId\` is the stable id used in audit/SSE as \`actor\`: \`ai:<tokenId>\`. Browsers that subscribe to \`GET /api/sync/events\` while using the same **write** token should persist \`tokenId\` and skip \`patch\` events where \`actor\` matches (already applied locally). **Read-only** tokens never PATCH → skip logic not needed.
**401** — invalid or expired token.

---

## 2. Cloud sync

### 2.1 GET /api/sync/version

\`\`\`http
GET ${baseUrl}/api/sync/version
X-Google-User-Id: YOUR_USER_ID
Authorization: Bearer <token>   # optional; recommended
\`\`\`

**200** — \`{ "version": 74, "updated_at": "2026-03-19T04:57:11.866Z" }\`  
**404** — no cloud backup yet (often \`{ "error": "ยังไม่มีข้อมูลบน Cloud" }\`).

### 2.2 GET /api/sync/download

Returns the full portable JSON backup (same shape as upload body).

\`\`\`http
GET ${baseUrl}/api/sync/download
X-Google-User-Id: YOUR_USER_ID
\`\`\`

**200** — JSON with \`schema_version\`, \`version\`, \`updated_at\`, \`tables\` (10 keys).  
**404** — no backup (Thai error string possible).

### 2.3 POST /api/sync/upload

Replaces the entire backup for the user when \`version\` is newer than the server (unless \`force\`).

\`\`\`http
POST ${baseUrl}/api/sync/upload
Content-Type: application/json
X-Google-User-Id: YOUR_USER_ID

{
  "schema_version": 1,
  "version": 75,
  "updated_at": "2026-03-19T10:00:00.000Z",
  "tables": { ... }
}
\`\`\`

**200** — \`{ "ok": true }\`  
**409** — server backup is newer; body includes \`conflict\`, \`remoteVersion\`, \`remoteUpdatedAt\` (Thai \`error\` possible).  
**Force** — \`POST ${baseUrl}/api/sync/upload?force=1\` (overwrites; data loss risk).

**Version workflow (full upload)**:
1. \`GET /api/sync/version\` (or download) → read \`version\`.
2. Client must send \`version > serverVersion\` for a normal successful upload.
3. On **409**, either download → merge → re-upload with a higher version, or use \`force=1\`.

### 2.4 PATCH /api/sync/patch

Apply up to **100** operations atomically per request. Server bumps \`version\` only when at least one op is **applied** (\`applied > 0\`).

\`\`\`http
PATCH ${baseUrl}/api/sync/patch
Content-Type: application/json
X-Google-User-Id: YOUR_USER_ID
Authorization: Bearer <token>   # optional; recommended

{
  "base_version": 74,
  "ops": [ ... ]
}
\`\`\`

**409** when \`base_version < serverVersion\` — refresh with \`GET /api/sync/version\` (or download), then retry with updated \`base_version\`.

#### Op: \`update\` (single-row \`id\`)

Requires \`field_updated_at\` with an ISO timestamp **per field** (merge: newer timestamp wins vs existing \`<field>_updated_at\` on the row).

\`\`\`json
{
  "op": "update",
  "table": "project_sub_topic_details",
  "id": "detail-row-id",
  "fields": { "status": "done" },
  "field_updated_at": { "status": "2026-03-20T10:00:00.000Z" }
}
\`\`\`

#### Op: \`insert\` (row object)

- Tables with a normal primary key \`id\`: \`row.id\` must be a non-empty string. Rejected if that \`id\` already exists.
- **Composite-key tables** (no single \`id\` column in backup rows): omit \`row.id\`. Uniqueness uses:
  - \`org_team_children\` → \`parent_id\` + \`child_id\`
  - \`cap_projects\` → \`cap_id\` + \`project_id\`
  - \`capability_order\` → \`sort_order\` (one row per slot)

\`\`\`json
{ "op": "insert", "table": "org_team_children", "row": { "parent_id": "team-a", "child_id": "team-b", "sort_order": 0 } }
\`\`\`

#### Op: \`delete\`

- **By id** (most tables): \`{ "op": "delete", "table": "projects", "id": "project-id" }\`
- **By composite key** (e.g. \`org_team_children\`, \`cap_projects\`; also works when matching multiple columns):

\`\`\`json
{
  "op": "delete",
  "table": "org_team_children",
  "composite_id": { "parent_id": "team-1", "child_id": "team-2" }
}
\`\`\`

**200** — \`{ "ok": true, "version": <number>, "applied": <n>, "rejected": [{ "index": 0, "error": "..." }] }\`  
**400** — invalid payload or \`ops limit exceeded (max 100)\`.

**Allowed \`table\` values** (whitelist):  
\`projects\`, \`project_teams\`, \`project_topics\`, \`project_sub_topics\`, \`project_sub_topic_details\`, \`org_teams\`, \`org_team_children\`, \`capability_order\`, \`caps\`, \`cap_projects\`.

### 2.5 Audit log & undo (PATCH side effects)

- Files: \`data/audit/<userId>/<YYYY-MM-DD>.jsonl\` (one JSON object per line).
- All ops from one PATCH share the same \`req_id\`.

\`\`\`http
GET ${baseUrl}/api/audit?date=2026-03-21
GET ${baseUrl}/api/audit?table=project_sub_topic_details&id=<rowId>
\`\`\`

\`\`\`http
POST ${baseUrl}/api/audit/undo/<req_id>
X-Google-User-Id: YOUR_USER_ID
Authorization: Bearer <token>
\`\`\`

### 2.6 EA weekly status history (per project)

Server-side timeline: custom week ranges per project, snapshots of subtopic RED/YELLOW/GREEN grouped by team.

- Files: \`data/ea/<userId>/<projectId>/weeks.json\` and \`data/ea/<userId>/<projectId>/snapshots/W<week_no>_<ISO>.json\`.
- **Write** token scope: \`PUT\` weeks, \`POST\` snapshot. **Read** or **write**: \`GET\` weeks/history/overview/summary.

\`\`\`http
GET ${baseUrl}/api/ea/overview
X-Google-User-Id: YOUR_USER_ID
Authorization: Bearer <token>   # optional
\`\`\`

**200** — \`{ "ok": true, "projects": [{ "project_id", "project_name", "weeks_defined", "snapshots_count", "latest": { "ts", "week_no", "week_label", "subtopic_totals" } }] }\`

\`\`\`http
GET ${baseUrl}/api/ea/<projectId>/summary
X-Google-User-Id: YOUR_USER_ID
\`\`\`

**200** — \`{ "ok": true, "project_id", "project_name", "weeks", "snapshots_count", "latest": { "by_team": { "<team>": { "RED", "YELLOW", "GREEN" } }, ... } }\`

\`\`\`http
PUT ${baseUrl}/api/ea/<projectId>/weeks
Content-Type: application/json
X-Google-User-Id: YOUR_USER_ID
Authorization: Bearer <token>

{ "weeks": [{ "week_no": 1, "label": "W1", "start": "2026-03-01", "end": "2026-03-07" }] }
\`\`\`

\`\`\`http
POST ${baseUrl}/api/ea/<projectId>/snapshot
Content-Type: application/json
Authorization: Bearer <token>

{ "week_no": 1 }
\`\`\`

\`\`\`http
GET ${baseUrl}/api/ea/<projectId>/history
X-Google-User-Id: YOUR_USER_ID
\`\`\`

Response includes \`snapshots\` (deduped by \`week_no\` unless \`?all=1\`), \`total_files\`, \`display_mode\`. Each PUT to weeks bumps \`weeks_revision\`; snapshots store that revision at capture time.

**MCP tools:** \`create_weekly_snapshot\` (\`project_id\`, \`week_no\`), \`get_weekly_history\` (\`project_id\`, optional \`week_no\`).

### 2.7 GET /api/sync/events

Subscribe to real-time ops stream. Reconnect with \`Last-Event-Id\` header to replay missed ops.

\`\`\`http
GET ${baseUrl}/api/sync/events
X-Google-User-Id: YOUR_USER_ID
Authorization: Bearer <token>   # optional; \`read\` or \`write\` scope
\`\`\`

- \`event: version\` → \`{ "version", "updated_at" }\` (on connect)
- \`event: patch\` → \`{ "version", "ops": [], "actor", "ts" }\` (after every PATCH)
- \`event: upload\` → \`{ "version", "ts" }\` (after full upload → re-download)
- \`event: ping\` → \`{ "ts" }\` (every 30s keepalive)

SSE \`id:\` lines use the backup \`version\` so clients can resume with \`Last-Event-Id\`.

**Skip duplicate \`patch\` on the client (optional)** — \`actor\` is \`human:<googleId>\` for browser Google login, or \`ai:<tokenId>\` for API tokens. Skip apply when it matches the current session (human id or \`tokenId\` from \`POST /api/auth/token/login\`).

---

## 3. Data model (10 sync tables)

Export/import order (dependency-ish):

1. **projects** — \`id\`, \`name\`, \`description\`
2. **project_teams** — \`id\`, \`project_id\`, \`name\`, \`sort_order\`
3. **project_topics** — \`id\`, \`team_id\`, \`title\`, \`sort_order\`
4. **project_sub_topics** — \`id\`, \`topic_id\`, \`title\`, \`status\` (\`GREEN\` | \`YELLOW\` | \`RED\`), \`sub_topic_type\` (\`todos\` | \`status\`), \`sort_order\`
5. **project_sub_topic_details** — \`id\`, \`sub_topic_id\`, \`text\`, \`description\`, \`status\` (\`todo\` | \`doing\` | \`done\`), \`due_date\` (\`YYYY-MM-DD\`), \`sort_order\`
6. **org_teams** — \`id\`, \`name\`, \`owner\`, \`parent_id\`
7. **org_team_children** — \`parent_id\`, \`child_id\`, \`sort_order\` (composite identity)
8. **capability_order** — \`sort_order\`, \`cap_id\`
9. **caps** — \`id\`, \`name\`, \`cols\` (\`12\`|\`6\`|\`4\`|\`3\`), \`rows\`
10. **cap_projects** — \`cap_id\`, \`project_id\`, \`status\`, \`cols\`, \`sort_order\`

**Hierarchy (projects)**:

\`\`\`text
projects
  └── project_teams
        └── project_topics
              └── project_sub_topics   (RAG status: GREEN / YELLOW / RED)
                    └── project_sub_topic_details   (todo / doing / done + due_date)
\`\`\`

**Org teams**:

\`\`\`text
org_teams
  └── org_team_children (parent_id → child_id, ordered by sort_order)
\`\`\`

**Capability grid**:

\`\`\`text
capability_order (ordered list of cap_id)
  └── caps
        └── cap_projects
\`\`\`

---

## 4. Browser UI (no separate REST) — Summary & PDF

The **Project Manage** page exposes **Summary View** (modal): executive summary, tables, and cards (**Critical / Manageable / Normal**) including todos under each sub-topic.

- **Timeline** tab: vertical timeline by \`due_date\` (\`YYYY-MM-DD\`) on \`project_sub_topic_details\`. Multiple todos on the **same date** under the **same sub-topic** are grouped into one card (same grouping idea as Summary).
- **Date filter** (modal toolbar): start/end date inclusive; optional **include items without due date** checkbox. Filtering affects counts, Summary, Timeline, and exported PDF.
- **Save PDF**: client-side (\`html2canvas\` + \`jsPDF\`), single continuous page; filename \`{projectName}_{Summary|Timeline}_{YYYYMMDD}.pdf\`.

**For AI-only API workflows**: reproduce the same reports from \`GET /api/sync/download\` by joining \`project_sub_topics\` and \`project_sub_topic_details\` (and parent tables for labels).

---

## 5. Sync payload shape

\`\`\`json
{
  "schema_version": 1,
  "version": 74,
  "updated_at": "2026-03-19T04:57:11.866Z",
  "tables": {
    "projects": [],
    "project_teams": [],
    "project_topics": [],
    "project_sub_topics": [],
    "project_sub_topic_details": [],
    "org_teams": [],
    "org_team_children": [],
    "capability_order": [],
    "caps": [],
    "cap_projects": []
  }
}
\`\`\`

**Encrypted backup** (optional, client-side AES-GCM — server stores opaque fields):

\`\`\`json
{
  "version": 74,
  "updated_at": "...",
  "enc": "<base64>",
  "iv": "<base64>",
  "salt": "<base64>"
}
\`\`\`

---

## 6. Minimal agent workflow (copy-paste)

### Login

\`\`\`bash
curl -s -X POST ${baseUrl}/api/auth/token/login \\
  -H "Content-Type: application/json" \\
  -d '{"token":"atkn_YOUR_TOKEN"}'
\`\`\`

### Read version

\`\`\`bash
curl -s ${baseUrl}/api/sync/version \\
  -H "X-Google-User-Id: YOUR_USER_ID"
\`\`\`

### List projects

\`\`\`bash
curl -s ${baseUrl}/api/sync/download \\
  -H "X-Google-User-Id: YOUR_USER_ID" \\
  | jq '.tables.projects[] | {id, name}'
\`\`\`

### Open tasks (details not done)

\`\`\`bash
curl -s ${baseUrl}/api/sync/download \\
  -H "X-Google-User-Id: YOUR_USER_ID" \\
  | jq '[.tables.project_sub_topic_details[] | select(.status != "done") | {text, status, due_date}]'
\`\`\`

### Patch one field

\`\`\`bash
curl -s -X PATCH ${baseUrl}/api/sync/patch \\
  -H "Content-Type: application/json" \\
  -H "X-Google-User-Id: YOUR_USER_ID" \\
  -d '{"base_version":74,"ops":[{"op":"update","table":"project_sub_topic_details","id":"ROW_ID","fields":{"status":"done"},"field_updated_at":{"status":"2026-03-21T12:00:00.000Z"}}]}'
\`\`\`

### Full upload (after editing downloaded JSON)

\`\`\`bash
curl -s -X POST ${baseUrl}/api/sync/upload \\
  -H "Content-Type: application/json" \\
  -H "X-Google-User-Id: YOUR_USER_ID" \\
  -d @modified_backup.json
\`\`\`

---

## 7. Checklist

1. Token login → \`googleId\`
2. \`GET /api/sync/version\` or download → know \`version\`
3. Prefer \`PATCH /api/sync/patch\` for small changes (\`base_version\` must match server)
4. Use \`POST /api/sync/upload\` for bulk replace or merge-then-upload
5. Parse the 10 \`tables.*\` arrays for domain logic
6. Use \`GET /api/audit\` / \`POST /api/audit/undo/...\` when you need traceability or rollback

---
*ArchTown AI context — Markdown reference for GET /api/ai/context · Express + React + SQLite WASM*
`;
}
