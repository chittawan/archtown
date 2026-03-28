สร้าง Timeline Status History ต่อ project ที่:

แสดง snapshot ของ subtopic status (RED/YELLOW/GREEN) แยกตาม team ในแต่ละ week  
Week กำหนดเองต่อ project — ไม่ได้ใช้ ISO week แต่ใช้ date range ที่ user ตั้ง  
description ของแต่ละ item คือ subtopic title ที่มี status นั้น

```ts
// week definition — per project
{
  project_id: string
  weeks: [
    { week_no: 1, label: "W1", start: "2026-03-01", end: "2026-03-07" },
    { week_no: 2, label: "W2", start: "2026-03-08", end: "2026-03-14" },
    { week_no: 3, label: "W3", start: "2026-03-15", end: "2026-03-21" }
  ]
}

// snapshot content — 1 file per snapshot
{
  ts: "2026-03-07T17:00:00Z",     // เวลาที่ snapshot
  trigger: "end-of-week",
  project_id: "performance_management",
  week_no: 1,
  week_label: "W1",
  week_start: "2026-03-01",
  week_end: "2026-03-07",

  teams: {
    "Infra": {
      RED:    [{ subtopic_id, title: "credential MSSQL..." }],
      YELLOW: [{ subtopic_id, title: "Resource On Kube..." }],
      GREEN:  [{ subtopic_id, title: "Network Topology..." }]
    },
    "Platform-Core": {
      RED:    [],
      YELLOW: [{ subtopic_id, title: "CI/CD Pipeline" }],
      GREEN:  [{ subtopic_id, title: "Traffic & Performance" }]
    }
  }
}
```

---

## Todo (แตกย่อย — ทำตามลำดับแนะนำ)

### ขั้นเตรียม

- [ ] **(P1)** ล็อก path บนดิสก์: `data/ea/<userId>/<projectId>/weeks.json` และ `data/ea/<userId>/<projectId>/snapshots/W<week_no>_<ISO>.json`
- [ ] **(P2)** ยืนยัน schema ในไฟล์ snapshot มี `ts`, `week_no`, `week_label`, `week_start`, `week_end`, `teams` ตามตัวอย่างด้านบน
- [ ] **(P3)** กำหนด validation ขั้นต่ำ: `week_no` ต้องมีใน `weeks.json`, วันที่ `start`/`end` ไม่ทับซ้อนแบบผิดรูปแบบ (ถ้าต้องการ)

### Service — `server/services/eaWeeklyService.ts`

- [ ] **(S1)** `getWeeks(userId, projectId)` — อ่าน `weeks.json` (ถ้าไม่มี return ค่าว่างหรือ 404 ตาม convention)
- [ ] **(S2)** `saveWeeks(userId, projectId, weeks[])` — เขียน `weeks.json` + validate โครงสร้าง
- [ ] **(S3)** `takeWeeklySnapshot(userId, projectId, week_no)` — โหลด `data/sync/<userId>/backup.json`
- [ ] **(S4)** กรองเฉพาะ subtopic ที่อยู่ใน `projectId` (join `project_sub_topics` → `project_topics` → `project_teams`)
- [ ] **(S5)** group ตาม `team.name` → แยก `RED` / `YELLOW` / `GREEN` เป็น array ของ `{ subtopic_id, title }`
- [ ] **(S6)** เขียนไฟล์ snapshot ใต้ `snapshots/` ชื่อ `W<week_no>_<ISO>.json` และใส่ metadata week จาก `weeks.json`
- [ ] **(S7)** `getHistory(userId, projectId)` — โหลดทุก snapshot ในโฟลเดอร์ เรียง `week_no` / `ts`
- [ ] **(S8)** `getWeekSnapshot(userId, projectId, week_no)` — โหลด snapshot ของ week นั้น (หรือล่าสุดถ้ามีหลายไฟล์ — ระบุกฎในโค้ด)

### HTTP — `server/routes/eaRoutes.ts`

- [ ] **(H1)** `PUT /api/ea/:projectId/weeks` — body `{ weeks: [...] }` → `saveWeeks`
- [ ] **(H2)** `GET /api/ea/:projectId/weeks` → `getWeeks`
- [ ] **(H3)** `POST /api/ea/:projectId/snapshot` — body `{ week_no }` → `takeWeeklySnapshot`
- [ ] **(H4)** `GET /api/ea/:projectId/history` → `getHistory`
- [ ] **(H5)** `GET /api/ea/:projectId/history/:week_no` → `getWeekSnapshot`
- [ ] **(H6)** สถานะผิดพลาดชัดเจน: project ไม่มีใน backup, week ไม่นิยาม, snapshot ซ้ำ (ถ้าบล็อกหรือ overwrite — ตัดสินใจและทำให้สอดคล้อง)

### Auth / App

- [ ] **(A1)** ใช้ `optionalSyncTokenMiddleware` + `rejectClaimedSyncUserIdMismatch` + `syncRateLimiter` บน prefix `/api/ea` เหมือน `/api/audit`
- [ ] **(A2)** `server/createApp.ts` — `app.use('/api/ea', eaRoutes)` ตำแหน่งหลัง middleware ที่เหมาะสม

### MCP — `server/mcp/mcpServer.ts`

- [ ] **(M1)** `create_weekly_snapshot` — พารามิเตอร์ `projectId`, `week_no` → เรียก logic เดียวกับ POST snapshot
- [ ] **(M2)** `get_weekly_history` — พารามิเตอร์ `projectId` (และ optional `week_no` ถ้าต้องการ) → เรียก service เดียวกับ GET history

### เอกสาร

- [ ] **(D1)** `server/services/aiContextMarkdown.ts` — ลงรายการ endpoint `/api/ea/...` และ MCP tools ที่เพิ่ม

### ตรวจรับ (ไล่คู่ Acceptance)

- [ ] **(Q1)** PUT weeks แล้ว GET weeks ได้ชุดเดียวกัน
- [ ] **(Q2)** POST snapshot แล้วไฟล์มี subtopic titles ครบตาม team + status
- [ ] **(Q3)** GET history เรียง W1 → W2 → W3
- [ ] **(Q4)** เปรียบเทียบสอง snapshot ติดกันเห็น subtopic ย้ายสีชัด (manual หรือ doc วิธีดู)
- [ ] **(Q5)** ลองเรียก API ผ่าน token + user id เหมือน audit
- [ ] **(Q6)** ลอง MCP จาก client ที่ต่อ ArchTown MCP

**Dependencies สั้นๆ:** S3–S6 หลัง S1–S2; H* หลัง S*; M* หลัง S* (และควรหลัง A*); D1 หลัง H* + M*

---

## File Structure

```
data/
  ea/
    <userId>/
      <projectId>/
        weeks.json                          ← week definition ของ project นี้
        snapshots/
          W1_2026-03-07T17:00:00Z.json
          W2_2026-03-14T17:00:00Z.json
          W3_2026-03-21T17:00:00Z.json
```

---

## APIs ที่ต้องสร้าง

```
# กำหนด week สำหรับ project
PUT /api/ea/:projectId/weeks
body: { weeks: [{ week_no, label, start, end }] }

# ดู week definition
GET /api/ea/:projectId/weeks

# สร้าง snapshot ณ ปัจจุบัน
POST /api/ea/:projectId/snapshot
body: { week_no: 1 }
→ อ่าน subtopics ของ project → จัด group ตาม team + status → บันทึก

# ดู history ทุก week
GET /api/ea/:projectId/history
→ return weeks[] เรียงลำดับ พร้อม teams + subtopics ต่อ status

# ดู week เดียว
GET /api/ea/:projectId/history/:week_no
```

---

## Acceptance Criteria

- [ ] กำหนด week date range ต่อ project ได้ผ่าน `PUT /api/ea/:projectId/weeks`
- [ ] `POST` snapshot บันทึก subtopic titles แยกตาม team + RED/YELLOW/GREEN
- [ ] `GET` history return ทุก week เรียง W1 → W2 → W3
- [ ] subtopic ที่เปลี่ยน status ระหว่าง week เห็นได้ชัดเมื่อเปรียบเทียบ
- [ ] Auth + rate limit เหมือน `/api/audit`
- [ ] MCP tool: `create_weekly_snapshot`, `get_weekly_history`
- [ ] AI context doc อัปเดตแล้ว

**แมปกับ Todo:** P* = เตรียม, S* = service, H* = HTTP, A* = auth/app, M* = MCP, D* = doc, Q* = ตรวจรับ

---

## Prompt สำหรับ Cursor

```
ช่วยเพิ่ม EA Weekly Status History ใน ArchTown Express:

Architecture:
  data/ea/<userId>/<projectId>/weeks.json
  data/ea/<userId>/<projectId>/snapshots/W<n>_<ISO>.json

1. server/services/eaWeeklyService.ts:
   - saveWeeks(userId, projectId, weeks[])
   - getWeeks(userId, projectId)
   - takeWeeklySnapshot(userId, projectId, week_no):
       load backup.json → filter subtopics ของ project นี้
       join subtopic → topic → team (pattern จาก projectAggregates.ts)
       group by teamName → { RED: [subtopic titles], YELLOW: [...], GREEN: [...] }
       save W<week_no>_<ISO>.json
   - getHistory(userId, projectId) → load + sort ทุก snapshot
   - getWeekSnapshot(userId, projectId, week_no)

2. server/routes/eaRoutes.ts:
   PUT  /api/ea/:projectId/weeks
   GET  /api/ea/:projectId/weeks
   POST /api/ea/:projectId/snapshot  body: { week_no }
   GET  /api/ea/:projectId/history
   GET  /api/ea/:projectId/history/:week_no

3. Auth: optionalSyncTokenMiddleware + rejectClaimedSyncUserIdMismatch
   + syncRateLimiter (เหมือน /api/audit)

4. Mount ใน server/createApp.ts หลัง audit routes

5. เพิ่ม MCP tools:
   - create_weekly_snapshot(projectId, week_no)
   - get_weekly_history(projectId)

6. อัปเดต aiContextMarkdown.ts
```
