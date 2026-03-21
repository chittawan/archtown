
ฉันมีระบบ ArchTown (React + SQLite WASM)
มี PATCH /api/sync/patch บน server แล้ว รองรับ single id PK

ช่วย implement pendingOps queue + enqueue สำหรับ 7 tables นี้:

TABLES ที่ต้อง enqueue (single PK — ทำได้เลย):
  1. projects                   → update: name, description
  2. project_teams              → update: name, sort_order
  3. project_topics             → update: title, sort_order
  4. project_sub_topics         → update: title, status, sort_order
  5. project_sub_topic_details  → update: text, description, status, due_date, sort_order
                                   insert: row ใหม่
                                   delete: ลบด้วย id
  6. org_teams                  → update: name, owner, parent_id
  7. caps                       → update: name, cols, rows

TABLES ที่ยัง upload แบบเดิม (composite PK — ทำทีหลัง):
  - org_team_children, capability_order, cap_projects
  → ถ้ามีการแก้ tables เหล่านี้ ให้ fallback ไป POST /api/sync/upload เหมือนเดิม

โครงสร้างที่ต้องสร้าง:
1. pendingOps: Op[] — เก็บใน memory + persist ใน localStorage key "archtown_pending_ops"
2. ทุก write function ของ 7 tables → push op พร้อม field_updated_at: new Date().toISOString()
3. SyncManager.flush() → PATCH /api/sync/patch
   - 409 → GET /api/sync/version → update base_version → retry อัตโนมัติ 1 ครั้ง
   - network error → เก็บไว้ใน localStorage รอ online event
4. flush trigger: debounce 2s หลัง push op, beforeunload, online event