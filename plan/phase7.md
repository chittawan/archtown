Goal to Multi-Agent Software Development Lifecycle ครับ — เป็นทิศทางที่ industry goal

สิ่งที่สำคัญที่สุด — Task Locking
ก่อนอื่นเลย ต้องเพิ่ม MCP tool claim_task เพื่อป้องกัน 2 Cursor ทำ task เดียวกันครับ แค่เพิ่มใน mcpServer.ts:


// claim_task — Cursor เรียกก่อนเริ่มทำงาน
server.tool("claim_task",
  "Claim a task before starting work. Prevents other agents from taking the same task.",
  { id: z.string(), agent_name: z.string() },
  async ({ id, agent_name }) => {
    const version = await client.getVersion()
    const now = new Date().toISOString()
    const result = await client.patch(version, [{
      op: "update",
      table: "project_sub_topic_details",
      id,
      fields: { 
        status: "doing",
        description: `[claimed by ${agent_name} at ${now}]\n` + existingDescription
      },
      field_updated_at: { status: now, description: now }
    }])
    return { content: [{ type: "text", text: JSON.stringify(result) }] }
  }
)


จากนั้น .cursorrules สำหรับแต่ละเครื่องบอกชื่อตัวเองครับ:
markdown# .cursorrules — Cursor Machine A

## ArchTown Workflow
1. get_tasks(status="todo") → เลือก task ที่ยังไม่มี [claimed by]
2. claim_task(id, agent_name="cursor-a") — ทันทีก่อนเริ่ม
3. implement ตาม description
4. update_task(id, status="done") เมื่อเสร็จ


Lifecycle ที่สมบูรณ์ — เรียงตาม priority
สิ่งที่ทำได้เลยตอนนี้คือเพิ่ม claim_task tool ใน MCP แล้วตั้ง .cursorrules ทั้งสองเครื่องให้ claim ก่อนทำเสมอ นั่นคือ 80% ของปัญหา multi-agent แก้ได้ทันทีครับ
ส่วนที่เหลืออย่าง CI/CD webhook กับ Notify channel เป็น nice-to-have ที่เพิ่มทีหลังได้ เพราะ core loop — Plan → Claim → Implement → Done — ทำงานได้แล้วโดยไม่ต้องรอครับ