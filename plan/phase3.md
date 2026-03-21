Auditlog

Schema ที่แนะนำ — 1 line ต่อ 1 op
ปัจจุบัน log เก็บแบบ 1 line ต่อ 1 request (รวม ops ทั้งหมดไว้ใน array) แนะนำเปลี่ยนเป็น 1 line ต่อ 1 op แทนครับ เพราะ query ง่ายกว่ามาก และ rollback ทำได้ทีละ operation


Schema จริง — ตัวอย่าง 1 line ใน .jsonl
{
  "req_id": "r_1711014000_abc123",
  "actor": "ai:atkn_xyz",
  "actor_type": "ai",
  "userId": "107508959445697114581",
  "version_before": 74,
  "version_after": 75,
  "ts": "2026-03-21T10:00:00.123Z",

  "op": "update",
  "table": "project_sub_topic_details",
  "id": "detail-abc-123",

  "before": { "status": "todo", "status_updated_at": null },
  "after":  { "status": "done", "status_updated_at": "2026-03-21T10:00:00Z" },

  "status": "applied",
  "error": null
}

กรณี rejected:
{
  "req_id": "r_1711014000_abc123",
  "actor": "ai:atkn_xyz",
  "actor_type": "ai",
  "userId": "107508959445697114581",
  "version_before": 74,
  "version_after": 74,
  "ts": "2026-03-21T10:00:01.456Z",

  "op": "update",
  "table": "project_sub_topic_details",
  "id": "nonexistent-id",

  "before": null,
  "after": null,

  "status": "rejected",
  "error": "Row not found (id=nonexistent-id)"
}
```

---

## Prompt สำหรับ Cursor
```
ช่วย refactor audit log ใน PATCH /api/sync/patch
จากแบบเดิม (1 line per request) เป็น 1 line per op

schema แต่ละ line:
{
  req_id: string,          // "r_" + Date.now() + "_" + random 6 chars
  actor: string,           // "ai:"+tokenId หรือ "human:"+userId
  actor_type: "ai"|"human",
  userId: string,
  version_before: number,
  version_after: number,   // เท่ากับ version_before ถ้า applied=0
  ts: string,              // ISO timestamp ของ op นี้

  op: "update"|"insert"|"delete",
  table: string,
  id: string,              // row id ที่แก้

  before: object | null,   // snapshot ของ row ก่อนแก้ (เฉพาะ fields ที่เปลี่ยน)
  after: object | null,    // snapshot หลังแก้

  status: "applied"|"rejected",
  error: string | null
}

เก็บไฟล์ที่: data/audit/<userId>/<YYYY-MM-DD>.jsonl
append ต่อท้ายทีละ op (ไม่ใช่ทีละ request)

หมายเหตุ:
- before/after เก็บเฉพาะ fields ที่เกี่ยวข้อง ไม่ต้องเก็บทั้ง row
- req_id เหมือนกันทุก op ใน request เดียวกัน (ใช้ group ได้)
- actor ดูจาก tokenAuth?.tokenId หรือ "human:"+userId ถ้าไม่มี token
```

---

## Bonus — API ที่ควรเพิ่มคู่กัน

เมื่อมี log แบบนี้แล้ว endpoint เหล่านี้ทำได้ทันทีโดยแค่อ่าน `.jsonl`:
```
GET /api/audit?date=2026-03-21        → ดู activity วันนั้น
GET /api/audit?table=project_sub_topic_details&id=xxx  → history ของ record นั้น
POST /api/audit/undo/:req_id          → reverse ops ทั้ง request (ใช้ before snapshot)