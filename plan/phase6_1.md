จากที่ตรวจสอบ tools ที่มีใน Archtown MCP ตอนนี้มีเพียง:

จากที่ดู MCP tools ที่มีอยู่ตอนนี้ สรุปได้ดังนี้ครับ

✅ ทำได้แล้ว

create_project — สร้าง Project
create_sub_topic — สร้าง CAP (sub-topic ใต้ topic)
create_task — สร้าง Task
get_projects — ดู Projects
get_tasks — ดู Tasks
update_task — แก้ไข Task


❌ ยังขาด และอยากให้ำเพิ่มครับ
สิ่งที่ต้องการAPI ที่ขาดสร้าง Teamcreate_teamสร้าง Topic (หัวข้อหลักใน project)create_topicดู Topics ของ projectget_topics — ตอนนี้ create_sub_topic ต้องการ topic_id แต่ไม่มีวิธีดึง id มาได้เลยลบข้อมูลdelete_project, delete_topic, delete_sub_topic, delete_taskแก้ไข Project / Topic / Sub-topicupdate_project, update_topic, update_sub_topic

สรุปสิ่งที่สำคัญที่สุด คือ get_topics และ create_topic ครับ เพราะตอนนี้แม้จะสร้าง project ได้ แต่ไม่รู้ topic_id เลยทำให้สร้าง sub-topic ต่อไม่ได้เลยครับ 