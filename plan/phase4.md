Event format จริงที่ส่งผ่าน SSE
SSE protocol ใช้ plain text มี format เฉพาะครับ:

`id: 75
event: patch
data: {"version":75,"ops":[{"op":"update","table":"project_sub_topic_details","id":"abc","fields":{"status":"done"}}],"actor":"ai:atkn_xyz","ts":"2026-03-21T10:00:00Z"}

id: 76
event: patch
data: {"version":76,"ops":[...],"actor":"human:107...","ts":"..."}

event: ping
data: {"ts":"2026-03-21T10:00:30Z"}`

id: = version number → client ใช้ Last-Event-ID header ตอน reconnect เพื่อขอ replay ops ที่พลาดไป

Prompt สำหรับ Cursor — Server side

ช่วย implement SSE ใน ArchTown Express:

--- Server side ---

1. Connection registry (ไฟล์แยก sseRegistry.ts):
   const clients = new Map<string, Set<{id:string, res:Response, lastEventId:number}>>()

   export function addClient(userId, res, lastEventId)
   export function removeClient(userId, connId)
   export function broadcast(userId, eventName, data, eventId)
     → ส่งให้ทุก conn ใน clients.get(userId)
     → format: "id:{eventId}\nevent:{name}\ndata:{JSON}\n\n"

2. GET /api/sync/events endpoint:
   - headers: Content-Type: text/event-stream, Cache-Control: no-cache, Connection: keep-alive
   - userId จาก X-Google-User-Id หรือ token (เหมือน endpoint อื่น)
   - อ่าน Last-Event-Id header → ถ้ามี ให้ replay ops จาก audit log ที่ version > lastEventId
   - ส่ง event: version ทันทีที่ connect: data: {version, updated_at}
   - ping ทุก 30s: event: ping, data: {ts}
   - req.on('close') → removeClient

3. แก้ PATCH /api/sync/patch (หลัง save backup แล้ว):
   เพิ่ม: broadcast(userId, 'patch', { version: backup.version, ops: appliedOps, actor, ts }, backup.version)
   appliedOps = เฉพาะ ops ที่ status=applied (ไม่รวม rejected)

4. แก้ POST /api/sync/upload (หลัง save แล้ว):
   เพิ่ม: broadcast(userId, 'upload', { version: backup.version, ts }, backup.version)
   → บอก client ว่ามี full upload ให้ re-download

--- Frontend side ---

5. สร้าง useSyncEvents() hook:
   - EventSource('/api/sync/events', { withCredentials: true })
   - on 'patch': apply ops[] ลง SQLite WASM โดยตรง (ไม่ download ใหม่)
     แต่ skip ops ที่ actor ตรงกับตัวเอง (เพราะ local apply ไปแล้ว)
   - on 'upload': trigger full re-download
   - on 'version': เปรียบ version กับ local → ถ้า server ใหม่กว่า download ใหม่
   - on error: exponential backoff reconnect (1s, 2s, 4s, max 30s)
   - cleanup: es.close() ตอน unmount

6. เพิ่ม skip logic ใน apply:
   ถ้า event.actor === currentUserId → skip (เราส่งไปเองแล้ว local apply ไปแล้ว)