MCP Server connect

โครงสร้างไฟล์ที่จะสร้าง
server/
mcp/
mcpServer.ts ← McpServer setup
tools/
getTasks.ts
updateTask.ts

routes/
mcpRoutes.ts ← POST /mcp
index.ts ← mount /mcp route
claude_desktop_config.json
→ config สำหรับ Claude.a

ขั้นตอนทำใน Cursor — เรียงตามลำดับ
**ขั้นที่ 1 — Install dependencies:**
npm install @modelcontextprotocol/sdk zod


---

**ขั้นที่ 2 — Prompt สำหรับ Cursor:**
```
ช่วยสร้าง MCP Server ใน Express ของ ArchTown โดย:

1. สร้างไฟล์ server/mcp/mcpServer.ts:
   import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
   import { z } from "zod"
   
   สร้าง McpServer ชื่อ "archtown" version "1.0.0"
   
   tools ที่ต้องมี:

   get_projects:
   - ดึง GET /api/sync/download ด้วย userId ที่รับมา
   - return projects[] พร้อม subtopic status count (RED/YELLOW/GREEN)

   get_tasks:
   - params: status ("todo"|"doing"|"done"|"all"), project_id (optional), overdue_only (boolean)
   - ดึง download แล้ว filter project_sub_topic_details
   - overdue = due_date < today และ status !== "done"
   - return tasks พร้อม parent context (subtopic title, project name)

   create_task:
   - params: sub_topic_id, text, description (optional), due_date (optional, YYYY-MM-DD)
   - สร้าง id = "d-mcp-" + Date.now() + "-" + random 6 chars
   - เรียก PATCH /api/sync/patch op: insert
   - return { ok, version }

   update_task:
   - params: id, status (optional), due_date (optional), text (optional)
   - เรียก PATCH /api/sync/patch op: update พร้อม field_updated_at: now ISO
   - return { ok, version }

   undo_last:
   - params: req_id
   - เรียก POST /api/audit/undo/:req_id
   - return { ok }

   แต่ละ tool รับ userId และ token ผ่าน context
   (pass มาจาก mcpRoutes ตอน handle request)

2. สร้าง server/routes/mcpRoutes.ts:
   import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
   
   POST /mcp:
   - อ่าน X-Google-User-Id header และ Authorization Bearer token
   - สร้าง transport ใหม่ทุก request (stateless)
   - connect mcpServer กับ transport
   - handleRequest(req, res, req.body)

   GET /mcp/health:
   - return { ok: true, name: "archtown-mcp", version: "1.0.0" }

3. Mount ใน server index.ts:
   app.use('/mcp', mcpRoutes)

4. Base URL ให้อ่านจาก env ARCHTOWN_BASE_URL 
   (default: http://localhost:3000)
   ทุก tool ให้เรียก API ผ่าน BASE_URL นี้



**ขั้นที่ 3 — Config สำหรับ Claude.ai (หลัง deploy แล้ว):**
เปิด Claude.ai → Settings → Integrations → Add MCP Server:
json{
  "archtown": {
    "type": "url",
    "url": "https://archtown.codewalk.myds.me/mcp",
    "headers": {
      "X-Google-User-Id": "{google_id}",
      "Authorization": "Bearer atkn_REDACTED_USE_YOUR_TOKEN"
    }
  }
}

**ขั้นที่ 4 — ทดสอบ local ก่อน deploy:**
bash# ทดสอบ health
curl http://localhost:3000/mcp/health

# ทดสอบ MCP call ตรงๆ
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "X-Google-User-Id: YOUR_GOOGLE_USER_ID" \
  -H "Authorization: Bearer atkn_REDACTED_USE_YOUR_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }'
ถ้าได้ tools list กลับมา แสดงว่า MCP พร้อมแล้ว เอา config ไปใส่ Claude.ai ได้เลยครับ



จุดสำคัญที่ต้องระวัง — stateless transport ครับ แต่ละ request ต้องสร้าง transport ใหม่ทุกครั้ง เพราะ Claude.ai ส่งแบบ HTTP ไม่ใช่ persistent connection เหมือน stdio เริ่มได้เลยครับ ติดตรงไหนบอกผมได้เลย