ช่วยแก้ PATCH /api/sync/patch ที่มีอยู่แล้ว โดยแก้เฉพาะจุดเหล่านี้:

1. เพิ่ม TABLE_WHITELIST ก่อน handler:
   const TABLE_WHITELIST = new Set([
     'projects','project_teams','project_topics',
     'project_sub_topics','project_sub_topic_details',
     'org_teams','org_team_children',
     'capability_order','caps','cap_projects'
   ])
   แล้วเช็คในแต่ละ op: ถ้า table ไม่อยู่ใน whitelist → throw error เหมือนเดิม

2. จำกัด ops สูงสุด 100 รายการ:
   ถ้า ops.length > 100 → return 400 { ok:false, error:'ops limit exceeded (max 100)' }

3. bump version เฉพาะเมื่อ applied > 0 เท่านั้น:
   ย้าย  backup.version += 1  และ  backup.updated_at = now
   ไปอยู่หลัง if (applied > 0) { ... }
   ถ้า applied === 0 ให้ save backup เดิมโดยไม่ bump

4. เพิ่ม result ใน audit log:
   เปลี่ยน auditLine ให้รวม applied และ rejected ด้วย:
   { userId, ops, timestamp, result: { applied, rejected } }



ทดสอบหลังแก้ — 5 test cases
หลังแก้แล้วลอง test ด้วย curl นี้ครับ:

# 1. Happy path — ควรได้ ok:true, version เพิ่ม 1
curl -X PATCH https://archtown.codewalk.myds.me/api/sync/patch \
  -H "Content-Type: application/json" \
  -H "X-Google-User-Id: YOUR_ID" \
  -d '{"base_version":74,"ops":[{"op":"update","table":"project_sub_topic_details","id":"REAL_ID","fields":{"status":"done"},"field_updated_at":{"status":"2026-03-21T10:00:00Z"}}]}'

# 2. Version conflict — ควรได้ 409
curl -X PATCH ... -d '{"base_version":1,"ops":[...]}'

# 3. Unknown table — ควรได้ rejected ไม่ crash
curl -X PATCH ... -d '{"base_version":74,"ops":[{"op":"update","table":"HACKED_TABLE","id":"x","fields":{},"field_updated_at":{}}]}'

# 4. ops เกิน 100 — ควรได้ 400
# สร้าง array 101 items แล้วส่ง

# 5. ops ทั้งหมด rejected — version ไม่ควรเพิ่ม
curl -X PATCH ... -d '{"base_version":74,"ops":[{"op":"update","table":"projects","id":"NONEXISTENT","fields":{"name":"x"},"field_updated_at":{"name":"2026-01-01T00:00:00Z"}}]}'

สิ่งที่ดีมากที่มีอยู่แล้ว — ไม่ต้องแตะ
isSafeFieldKey() และ normalizeIsoTimestamp() ที่เรียกใช้อยู่นั้นดีมากครับ 