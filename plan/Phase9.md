status บอกแค่ว่างานเสร็จหรือยัง แต่ RAG บอกว่า "ควรกังวลไหม" ซึ่งตอบโจทย์ SA/Lead ได้ตรงกว่ามาก

ช่วยเพิ่ม health dimension ใน project_sub_topic_details ของ ArchTown:

1. schema เพิ่ม 3 fields (ไม่ต้องแก้ DB เพราะใช้ JSON):
   health: "GREEN" | "YELLOW" | "RED" | null
   health_note: string | null
   health_reviewed_at: ISO string | null

2. เพิ่ม MCP tool update_task_health:
   params: id, health ("GREEN"|"YELLOW"|"RED"), note (optional)
   → PATCH /api/sync/patch
     fields: { health, health_note, health_reviewed_at: now }
     field_updated_at: { health: now, health_note: now, ... }

3. เพิ่ม MCP tool get_unreviewed_tasks:
   → download → filter tasks ที่ health === null หรือ
     health_reviewed_at เก่ากว่า 7 วัน
   → return list พร้อม text + status ให้ SA review

4. อัปเดต EA snapshot service:
   ใน snapshotService.takeWeeklySnapshot() ให้เก็บ health
   แทน subtopic status
   group by health: RED/YELLOW/GREEN ต่อ team

5. อัปเดต aiContextMarkdown.ts