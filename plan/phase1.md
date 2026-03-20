ฉันมีระบบ ArchTown (Express + Node.js) ที่มี API:
- POST /api/auth/token/login  
- GET  /api/sync/download  
- POST /api/sync/upload

ช่วยทำสิ่งต่อไปนี้:
1. เพิ่ม token scope field (read / write) ใน token record
2. เพิ่ม rate limiting middleware: 60 req/min per token (ใช้ express-rate-limit)
3. เพิ่ม GET /api/sync/version → return { version, updated_at } จาก backup.json 
   โดยไม่ต้อง load ทั้งไฟล์ขึ้นมา

AI context doc อยู่ที่ /api/ai/context (Markdown)
Backup เก็บที่ data/sync/<userId>/backup.json