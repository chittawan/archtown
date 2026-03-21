เพิ่ม PATCH /api/sync/patch endpoint:

Request body:
{
  "base_version": 74,
  "ops": [
    { "op": "update", "table": "project_sub_topic_details", 
      "id": "xxx", "fields": { "status": "done" }, 
      "field_updated_at": { "status": "2026-03-20T10:00:00Z" } },
    { "op": "insert", "table": "project_sub_topic_details", "row": { ... } },
    { "op": "delete", "table": "project_sub_topic_details", "id": "yyy" }
  ]
}

Logic:
1. Load backup.json ของ user
2. ถ้า base_version < server version → reject 409
3. Apply ops ทีละ op ด้วย field-level merge (เอา field_updated_at ที่ใหม่กว่า)
4. bump version +1, update updated_at
5. Save backup.json
6. Return { ok: true, version: 75, applied: N, rejected: [] }

พร้อมเพิ่ม audit log บันทึก: userId, ops[], timestamp ทุกครั้งที่มี patch