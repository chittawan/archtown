จากที่ตรวจสอบ tools ที่มีใน Archtown MCP ตอนนี้มีเพียง:

get_projects — ดู project ที่มีอยู่
get_tasks — ดู tasks
create_task — สร้าง task (ต้องการ sub_topic_id ที่มีอยู่แล้ว)
update_task — แก้ไข task

ยังไม่มี API สำหรับ สร้าง project ใหม่ หรือ สร้าง sub-topic ใหม่ ครับ ดังนั้นไม่สามารถสร้าง project "archdize" ผ่านที่นี่ได้โดยตรง
ทางเลือกที่แนะนำครับ:
ขอให้ทีม dev เพิ่ม API create_project และ create_sub_topic เข้าไปใน MCP server