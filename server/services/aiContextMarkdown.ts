export function buildAIContextMarkdown(baseUrl: string): string {
  return `# ArchTown — Open Claw AI Context

> API Reference & Learning Context for ArchTown
> Use this document to quickly access project data via API.

---

## Quick Reference — All Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/token/generate | Generate AI Login Token |
| POST | /api/auth/token/login | Login with Token → get userId |
| GET | /api/sync/download | Download full backup (JSON) |
| POST | /api/sync/upload | Upload backup (JSON) |
| GET | /api/sync/version | Get backup meta (version, updated_at) |
| PATCH | /api/sync/patch | Patch backup (field-level ops) |
| GET | /api/audit | Audit log (by date or table+id) |
| POST | /api/audit/undo/:req_id | Undo one PATCH request (by req_id) |
| GET | /api/ai/context | This document (Markdown) |

Base URL: ${baseUrl}

---

## 1. Authentication — Token Login

ArchTown supports 2 login methods: **Google OAuth** and **AI Login Token**.
For AI agents, use Token to identify and access Cloud Sync.

### Flow
1. Admin generates Token via \`POST /api/auth/token/generate\` or UI \`/admin/generate-token\`
2. AI Agent logs in via \`POST /api/auth/token/login\`
3. Receives \`googleId\` → use as User ID for Cloud Sync
4. Pass \`X-Google-User-Id\` header (and \`Authorization: Bearer <token>\` to enforce token scope + per-token rate limit) in every Sync API call

### POST /api/auth/token/generate

\`\`\`
Request:
  POST ${baseUrl}/api/auth/token/generate
  Content-Type: application/json
  X-Admin-Key: <optional, only if ARCHTOWN_ADMIN_KEY is set>

  {
    "googleId": "107508959445697114581",
    "expiresAt": "2026-12-31T23:59:59Z",   // or null for no-expire
    "scope": "read" | "write"          // optional, default "write"
  }

Response 200:
  {
    "ok": true,
    "token": "atkn_<base64url_random>",
    "googleId": "107508959445697114581",
    "expiresAt": "2026-12-31T23:59:59.000Z"
  }

Error 401:
  { "ok": false, "error": "unauthorized" }
\`\`\`

### POST /api/auth/token/login

\`\`\`
Request:
  POST ${baseUrl}/api/auth/token/login
  Content-Type: application/json

  { "token": "atkn_<base64url_random>" }

Response 200:
  {
    "ok": true,
    "googleId": "107508959445697114581",
    "expiresAt": "2026-12-31T23:59:59.000Z"
  }

Error 401:
  { "ok": false, "error": "invalid token" }
  { "ok": false, "error": "token expired" }
\`\`\`

Security: Tokens are stored as SHA-256 hashes on server — cannot be recovered. Generate a new one if lost.

---

## 2. Cloud Sync — Download / Upload Backup

Cloud Sync backs up/restores all data from browser SQLite to server as JSON per user.

### Architecture
- Storage: \`data/sync/<userId>/backup.json\`
- User ID: header \`X-Google-User-Id\` or query \`?userId=\`, fallback \`guest\`
- Version conflict: server compares \`version\` — rejects if client ≤ server (409)
- Optional AES-GCM encryption (client-side)

### GET /api/sync/version

\`\`\`
Request:
  GET ${baseUrl}/api/sync/version
  X-Google-User-Id: YOUR_USER_ID
  Authorization: Bearer <token>   // optional (recommended for per-token rate limit + scope)

Response 200:
  { "version": 74, "updated_at": "2026-03-19T04:57:11.866Z" }

Error 404:
  { "error": "ยังไม่มีข้อมูลบน Cloud" }
\`\`\`

### GET /api/sync/download

\`\`\`
Request:
  GET ${baseUrl}/api/sync/download
  X-Google-User-Id: YOUR_USER_ID

Response 200 (plain backup):
  {
    "schema_version": 1,
    "version": 74,
    "updated_at": "2026-03-19T04:57:11.866Z",
    "tables": {
      "projects": [{ "id": "...", "name": "...", "description": "..." }],
      "project_teams": [{ "id": "...", "project_id": "...", "name": "...", "sort_order": 0 }],
      "project_topics": [...],
      "project_sub_topics": [...],
      "project_sub_topic_details": [...],
      "org_teams": [...],
      "org_team_children": [...],
      "capability_order": [...],
      "caps": [...],
      "cap_projects": [...]
    }
  }

Error 404:
  { "error": "ยังไม่มีข้อมูลบน Cloud" }
\`\`\`

### POST /api/sync/upload

\`\`\`
Request:
  POST ${baseUrl}/api/sync/upload
  Content-Type: application/json
  X-Google-User-Id: YOUR_USER_ID

  {
    "schema_version": 1,
    "version": 75,
    "updated_at": "2026-03-19T10:00:00Z",
    "tables": { ... all 10 tables ... }
  }

Response 200:
  { "ok": true }

Error 409 (conflict — cloud has newer data):
  {
    "ok": false,
    "error": "Cloud มีข้อมูลใหม่กว่า",
    "conflict": true,
    "remoteVersion": 74,
    "remoteUpdatedAt": "2026-03-19T04:57:11.866Z"
  }

Force upload (ignore conflict):
  POST ${baseUrl}/api/sync/upload?force=1
\`\`\`

### Version Check Flow (Architect Check)
1. \`GET /api/sync/version\` — check \`version\` and \`updated_at\`
2. Compare with local — if remote > local, there is a new update
3. To upload: set version = remote version + 1
4. On 409 conflict: use \`?force=1\` to overwrite (caution: data loss)

### PATCH /api/sync/patch

\`\`\`
Request:
  PATCH ${baseUrl}/api/sync/patch
  Content-Type: application/json
  X-Google-User-Id: YOUR_USER_ID
  Authorization: Bearer <token>   // optional (recommended)

{
  "base_version": 74,
  "ops": [
    { "op": "update", "table": "project_sub_topic_details",
      "id": "xxx", "fields": { "status": "done" },
      "field_updated_at": { "status": "2026-03-20T10:00:00Z" } },
    { "op": "insert", "table": "project_sub_topic_details",
      "row": { "id": "...", "status": "todo", "sort_order": 0 } },
    { "op": "delete", "table": "project_sub_topic_details", "id": "yyy" }
  ]
}
\`\`\`

Merge rule (field-level):
- For each updated field \`X\`, server compares \`X_updated_at\` (newer wins)
- If incoming is newer, server sets both \`X\` and \`X_updated_at\`

Rules:
- \`table\` must be one of the 10 sync tables (whitelist); otherwise op is rejected
- Max 100 ops per request; otherwise \`400\` \`ops limit exceeded (max 100)\`
- \`version\` / \`updated_at\` bump and disk save only when \`applied > 0\`

Response 200:
  { "ok": true, "version": 75, "applied": N, "rejected": [] }

Error 400:
  { "ok": false, "error": "ops limit exceeded (max 100)" }

Error 409:
  { "ok": false, "error": "...", "conflict": true, "remoteVersion": <serverVersion> }

### Audit log (PATCH)

- Storage: \`data/audit/<userId>/<YYYY-MM-DD>.jsonl\`
- **One line per op** (same \`req_id\` groups all ops from one PATCH request)
- \`actor\`: \`ai:<tokenRecordUuid>\` or \`human:<userId>\`

\`\`\`
GET ${baseUrl}/api/audit?date=2026-03-21
GET ${baseUrl}/api/audit?table=project_sub_topic_details&id=<rowId>

Response 200:
  { "ok": true, "lines": [ ...AuditRecord ] }
\`\`\`

\`\`\`
POST ${baseUrl}/api/audit/undo/<req_id>
  X-Google-User-Id: YOUR_USER_ID
  Authorization: Bearer <token>   // write scope if using token

Response 200:
  { "ok": true, "reversed": N, "version": <newVersion> }
\`\`\`

---

## 3. Data Models

### 10 Sync Tables (export order)

1. **projects** — id, name, description
2. **project_teams** — id, project_id, name, sort_order
3. **project_topics** — id, team_id, title, sort_order
4. **project_sub_topics** — id, topic_id, title, status (GREEN/YELLOW/RED), sub_topic_type (todos/status), sort_order
5. **project_sub_topic_details** — id, sub_topic_id, text, description, status (todo/doing/done), due_date (YYYY-MM-DD), sort_order
6. **org_teams** — id, name, owner, parent_id
7. **org_team_children** — parent_id, child_id, sort_order
8. **capability_order** — sort_order, cap_id
9. **caps** — id, name, cols (12/6/4/3), rows
10. **cap_projects** — cap_id, project_id, status, cols, sort_order

### Table Hierarchy

\`\`\`
projects
  └─ project_teams        (1:N)
       └─ project_topics   (1:N)
            └─ project_sub_topics  (1:N)  — status: RED/YELLOW/GREEN
                 └─ project_sub_topic_details (1:N) — todo/doing/done + due_date
\`\`\`

### Status Values
- Project SubTopic: GREEN (Normal), YELLOW (Manageable), RED (Critical)
- Detail items: todo, doing, done

### Org Teams
\`\`\`
org_teams (parent/child hierarchy)
  └─ org_team_children (parent_id → child_id, sorted)
\`\`\`

### Capability (Dashboard Grid)
\`\`\`
capability_order (display order of caps)
  └─ caps (grid container: cols, rows)
       └─ cap_projects (project assignment to cap)
\`\`\`

---

## 4. Project Manage — Summary View & PDF Export (browser UI)

ฟีเจอร์นี้อยู่ที่หน้า **Project Manage** ปุ่ม **Summary View** (modal) — **ไม่มี REST endpoint แยก**; ดึงข้อมูลจาก state โปรเจกต์ในเบราว์เซอร์ (SQLite WASM / sync) เหมือนส่วนอื่นของแอป

### โหมดแสดงผล
- **Summary**: Executive summary + ตารางสรุปทีม/หัวข้อ + การ์ดรายละเอียดแยก Critical / Manageable / Normal (รวม Todo ในแต่ละหัวข้อย่อย)
- **Timeline**: ไทม์ไลน์แนวตั้ง เรียงตาม \`due_date\` (รูปแบบ **YYYY-MM-DD**) ของแถวใน \`project_sub_topic_details\` — รวมหลาย Todo **วันเดียวกัน + หัวข้อย่อยเดียวกัน** เป็นการ์ดเดียว (เหมือนการ์ดในโหมด Summary)

### กรองช่วงวันที่ (Report filter)
ที่แถบมุมขวาบนของ modal:
- **วันที่เริ่มต้น** / **วันที่สิ้นสุด** — กรองเฉพาะรายการ detail ที่มี \`due_date\` อยู่ในช่วม \[start, end\] (เทียบสตริงวันที่)
- **รวมรายการไม่ระบุวัน** (checkbox, เปิดค่าเริ่มต้น) — ถ้าเปิด: รายการที่ไม่มี \`due_date\` หรือรูปแบบไม่ใช่ YYYY-MM-DD ยังถูกรวม; ถ้าปิด: รายการเหล่านั้นถูกตัดออกจากรายงาน
- การกรองมีผลกับทั้ง **ตัวเลขสรุปด้านบน**, เนื้อหา **Summary**, **Timeline** และ **ไฟล์ PDF** ที่ส่งออกในขณะนั้น

### Save PDF
- ปุ่ม **Save PDF** สร้างไฟล์ฝั่ง client (\`html2canvas\` + \`jsPDF\`) เป็นหน้า PDF **ยาวต่อเนื่องหนึ่งหน้า** (ไม่ตัดเล่ม fixed A4 หลายหน้า)
- **ชื่อไฟล์**: \`{ชื่อโปรเจกต์}_{Summary|Timeline}_{YYYYMMDD}.pdf\`
  - \`Summary\` / \`Timeline\` ตามแท็บที่เลือกอยู่
  - \`YYYYMMDD\` = วันที่บนเครื่องผู้ใช้ตอนกดบันทึก

### สำหรับ AI ที่อ่านได้เฉพาะ API
ใช้ \`GET /api/sync/download\` แล้วนำ \`project_sub_topics\` + \`project_sub_topic_details\` ไปจัดช่วงวันที่ / สรุป / ไทม์ไลน์ได้แนวเดียวกับ UI

---

## 5. Sync Payload Format

\`\`\`json
{
  "schema_version": 1,
  "version": 74,
  "updated_at": "2026-03-19T04:57:11.866Z",
  "tables": {
    "projects": [...],
    "project_teams": [...],
    "project_topics": [...],
    "project_sub_topics": [...],
    "project_sub_topic_details": [...],
    "org_teams": [...],
    "org_team_children": [...],
    "capability_order": [...],
    "caps": [...],
    "cap_projects": [...]
  }
}
\`\`\`

Encrypted payload (optional, client-side AES-GCM):
\`\`\`json
{
  "version": 74,
  "updated_at": "...",
  "enc": "<base64 ciphertext>",
  "iv": "<base64 IV>",
  "salt": "<base64 salt>"
}
\`\`\`

---

## 6. Quick Start Workflow for AI Agent

### Step 1: Login
\`\`\`bash
curl -X POST ${baseUrl}/api/auth/token/login \\
  -H "Content-Type: application/json" \\
  -d '{"token": "atkn_YOUR_TOKEN"}'
# → { "ok": true, "googleId": "YOUR_USER_ID" }
\`\`\`

### Step 2: Check Sync Version
\`\`\`bash
curl -s ${baseUrl}/api/sync/download \\
  -H "X-Google-User-Id: YOUR_USER_ID" \\
  | jq '{version, updated_at}'
\`\`\`

### Step 3: Read Project Data
\`\`\`bash
# All projects
curl -s ${baseUrl}/api/sync/download \\
  -H "X-Google-User-Id: YOUR_USER_ID" \\
  | jq '.tables.projects[] | {id, name}'

# Incomplete tasks
curl -s ${baseUrl}/api/sync/download \\
  -H "X-Google-User-Id: YOUR_USER_ID" \\
  | jq '[.tables.project_sub_topic_details[] | select(.status != "done") | {text, status, due_date}]'

# Critical/Warning items
curl -s ${baseUrl}/api/sync/download \\
  -H "X-Google-User-Id: YOUR_USER_ID" \\
  | jq '[.tables.project_sub_topics[] | select(.status == "RED" or .status == "YELLOW") | {title, status}]'
\`\`\`

### Step 4: Update & Upload
\`\`\`bash
# 1. Download existing → modify → increment version → upload
curl -X POST ${baseUrl}/api/sync/upload \\
  -H "Content-Type: application/json" \\
  -H "X-Google-User-Id: YOUR_USER_ID" \\
  -d @modified_backup.json

# Force overwrite if conflict
curl -X POST "${baseUrl}/api/sync/upload?force=1" \\
  -H "Content-Type: application/json" \\
  -H "X-Google-User-Id: YOUR_USER_ID" \\
  -d @modified_backup.json
\`\`\`

---

## Summary Checklist

1. **Login** — Token login to get User ID
2. **Check Version** — Download backup, check version/updated_at
3. **Read Projects** — Parse tables.projects + related tables
4. **Read Teams** — Parse tables.org_teams + org_team_children
5. **Read Capability** — Parse caps + cap_projects + capability_order
6. **Read Tasks** — Parse project_sub_topic_details (todo/doing/done + due_date)
7. **Modify & Upload** — Edit data, increment version, upload back

---
*ArchTown — Open Claw AI Context v1 · SQLite WASM + React + Express*
`;
}
