จาก Phase2.md และ Pase2_1.md

Integration กับหน้า frontend ครับ 

เป้าหมาย
เป้าหมาย — browser ส่ง ops เหมือน AI

Browser
SQLite WASM -> ops [] PATCH /patch field-level merge
✓ ส่งแค่สิ่งที่เปลี่ยน → เร็วมาก
✓ AI + human ทำงานพร้อมกันได้
✓ audit log รู้ว่าใครแก้อะไร

=========================
ชิ้นที่ 1 — pendingOps queue (เพิ่มใน sync store/service):
// ตัวอย่าง: ทุก function ที่ write ลง SQLite ให้เพิ่ม op เข้า queue

// แทนที่จะเป็นแค่:
db.exec(`UPDATE project_sub_topic_details SET status=? WHERE id=?`, [status, id])

// เปลี่ยนเป็น:
function updateTaskStatus(id: string, status: string) {
  const before = db.exec(`SELECT status FROM project_sub_topic_details WHERE id=?`, [id])
  
  // 1. write local ก่อนเสมอ (offline-first ยังอยู่ครบ)
  db.exec(`UPDATE project_sub_topic_details SET status=? WHERE id=?`, [status, id])
  
  // 2. queue op ไว้
  pendingOps.push({
    op: 'update',
    table: 'project_sub_topic_details',
    id,
    fields: { status },
    field_updated_at: { status: new Date().toISOString() }
  })
  
  // 3. flush ไป server (debounced 1s)
  scheduleSync()
}

=========================
