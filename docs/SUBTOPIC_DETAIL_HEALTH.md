# SubTopic detail — task health (RAG)

ฟิลด์เสริมสำหรับ **รายการ Todo ภายใต้ SubTopic** (แต่ละ detail / “เรื่องที่ทำ”) เพื่อบันทึกมุมมองสุขภาพงานแยกจาก `status` (todo / doing / done) และจาก `status` ของหัวข้อย่อย (GREEN / YELLOW / RED)

## ฟิลด์ที่กรอกได้

| ความหมาย | TypeScript (`SubTopicDetail`) | SQLite (`project_sub_topic_details`) | YAML (ใน `details[]`) |
|-----------|-------------------------------|--------------------------------------|------------------------|
| แถวรายการ (stable) | `id` | `id` | `id` (ถ้าไม่มีตอน parse จะสร้างให้อัตโนมัติ) |
| สีสุขภาพงาน | `health` | `health` | `health` |
| หมายเหตุตอนรีวิว | `healthNote` | `health_note` | `healthNote` (หรือ `health_note` ตอนอ่านเข้า) |
| เวลารีวิวล่าสุด (ISO-8601) | `healthReviewedAt` | `health_reviewed_at` | `healthReviewedAt` (หรือ `health_reviewed_at` ตอนอ่านเข้า) |

### `health`

- ค่า: `"GREEN"` | `"YELLOW"` | `"RED"` | `null`
- `null` หรือไม่มีฟิลด์ = ยังไม่ได้กำหนด / ยังไม่รีวิว (ในโค้ดมักแยก `undefined` = ไม่ส่งมา, `null` = ล้างชัดเจน — ทั้งคู่แสดงว่าไม่มี RAG)

### `health_note` / `healthNote`

- ค่า: string หรือ `null`
- ใช้เก็บเหตุผลสั้น ๆ ตอนรีวิว (เช่น บล็อก, รอ stakeholder)

### `health_reviewed_at` / `healthReviewedAt`

- ค่า: string รูปแบบ ISO-8601 หรือ `null`
- เวลาที่ยืนยันการรีวิว health ล่าสุด

## JSON ตัวอย่าง (detail หนึ่งรายการ)

```json
{
  "text": "Deploy staging",
  "status": "doing",
  "health": "YELLOW",
  "healthNote": "รอ sign-off security",
  "healthReviewedAt": "2026-03-28T08:30:00.000Z"
}
```

## Schema แยก

ไฟล์ [schemas/subtopic-detail-health.json](../schemas/subtopic-detail-health.json) อธิบายเฉพาะสามฟิลด์ด้านบน (ใช้ประกอบเอกสารหรือ validation ภายนอก)

## UI (หน้าโปรเจกต์)

บนหน้า **จัดการโปรเจกต์** (`/project/manage`) แต่ละแถว Todo / รายการติดตามมีปุ่ม **สุขภาพงาน (RAG)** ใต้ Note — เปิดแผงเลือกเขียว/เหลือง/แดง หมายเหตุการรีวิว และปุ่มบันทึกเวลารีวิว — จุดสีข้างแถวสรุป RAG แบบย่อ — ชิปอ้างอิงใช้ `detail_id=<แถว id>` ไม่ใช่ index ในอาร์เรย์

## โค้ดอ้างอิง

- ชนิดข้อมูล: `src/types.ts` — `TaskHealthRag`, `SubTopicDetail`
- ตาราง: `src/db/schema.ts` — `project_sub_topic_details`
- YAML: `src/lib/projectYaml.ts` — parse/serialize รายการ `details`
- แถวรายการ + แผงสุขภาพ: `src/components/project/SortableSubTopicCard.tsx`
