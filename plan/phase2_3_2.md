ทำ B — Composite PK บน Server
เมื่อ Step A ทำงานได้แล้ว composite PK ทำได้ด้วยการเพิ่ม composite_id field เดียวใน op:

// server รับ op แบบนี้เพิ่มเติม
{
  "op": "delete",
  "table": "org_team_children",
  "composite_id": { "parent_id": "team-1", "child_id": "team-2" }
  // ไม่มี "id" field
}

// server logic เพิ่มแค่:
if (op.composite_id) {
  idx = tableRows.findIndex(r =>
    Object.entries(op.composite_id)
      .every(([k, v]) => r[k] === v)
  )
} else {
  idx = tableRows.findIndex(r => r.id === op.id)
}