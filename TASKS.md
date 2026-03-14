# Task ปรับปรุงระบบ ArchTown

รายการ Task เพื่อแก้ข้อบกพร่องและปรับปรุงระบบ (อ้างอิงจากการวิเคราะห์ภาพรวมและฟีเจอร์)

---

## สถานะ

- [ ] ไม่ได้เริ่ม
- [x] ทำเสร็จแล้ว

---

## 1. ข้อมูลและความสอดคล้อง (High)

### TASK-001: รวมโฟลเดอร์ Data/ กับ data/ เป็นโฟลเดอร์เดียว — [x] ทำเสร็จแล้ว

- **ปัญหา**: มีทั้ง `Data/` (ตัว D ใหญ่) และ `data/` (ตัว d เล็ก) ระบบใช้เฉพาะ `data/` ทำให้ข้อมูลใน `Data/` อาจไม่ถูกโหลดบนระบบที่แยก case
- **งาน**:
  - ย้ายไฟล์จาก `Data/Projects/` → `data/projects/` (รวมกับของเดิม ไม่ทับถ้า id ซ้ำ ให้ตรวจก่อน)
  - ย้ายไฟล์จาก `Data/teams/` → `data/teams/`
  - ย้ายไฟล์จาก `Data/capability/` → `data/capability/` (รวมกับ `_order.yaml` ตามความต้องการ)
  - ลบโฟลเดอร์ `Data/` หลังย้ายครบ
  - อัปเดต .gitignore / เอกสาร ถ้ามีการอ้างอิง `Data/`
- **เกณฑ์สำเร็จ**: มีเพียงโฟลเดอร์ `data/` เท่านั้น แอปโหลดโปรเจกต์/ทีม/capability ครบ

### TASK-002: เปลี่ยนชื่อโปรเจกต์ใน package.json — [x] ทำเสร็จแล้ว

- **ปัญหา**: `package.json` ยังเป็น `"name": "react-example"`
- **งาน**: เปลี่ยนเป็น `"name": "archtown"` (หรือชื่อที่ทีมกำหนด)
- **เกณฑ์สำเร็จ**: `npm run build` ผ่าน และชื่อใน package สอดคล้องกับผลิตภัณฑ์

### TASK-003: ปรับ title ใน index.html — [x] ทำเสร็จแล้ว

- **ปัญหา**: title เป็น "Summary Monthly Solution" ไม่ตรงกับชื่อผลิตภัณฑ์
- **งาน**: เปลี่ยนเป็น "ArchTown" (หรือชื่อที่ใช้ใน UI)
- **เกณฑ์สำเร็จ**: แท็บเบราว์เซอร์แสดงชื่อที่ถูกต้อง

---

## 2. ฟีเจอร์และ UX (Medium)

### TASK-004: จัดการหน้า Login

- **ตัวเลือก A**: ซ่อน route และลิงก์ไป `/login` ชั่วคราว แล้วแสดงข้อความ "Coming soon" ใน Landing
- **ตัวเลือก B**: Implement Login จริง (auth, session, ป้องกัน route)
- **งาน**: เลือกแนวทางแล้วดำเนินการให้ครบ (รวมถึงนำ `/login` ออกจากเมนูถ้าไม่ใช้)
- **เกณฑ์สำเร็จ**: ไม่มี dead link หรือหน้าว่างที่ไม่ตั้งใจ

### TASK-005: เพิ่มทางเข้า Projects ใน Navigation (ถ้าต้องการ) — [x] ทำเสร็จแล้ว

- **ปัญหา**: หน้า Project เข้าได้แค่จาก TownStation (double-click) หรือ ⌘K
- **งาน**: เพิ่มลิงก์ "Projects" หรือ dropdown เลือกโปรเจกต์ใน header (ถ้าทีมต้องการให้เห็นชัด)
- **เกณฑ์สำเร็จ**: ผู้ใช้เข้า `/project` หรือเลือกโปรเจกต์จาก header ได้ตามที่ออกแบบ

### TASK-006: ปรับปรุงข้อความ Error / Empty state

- **งาน**: ตรวจทุกหน้าที่โหลดจาก API ให้มีข้อความ error / empty state ที่อ่านง่ายและแนะนำการแก้ (เช่น "ลองรีเฟรช", "ตรวจสอบการเชื่อมต่อ")
- **เกณฑ์สำเร็จ**: ไม่มีหน้าที่ error แล้วแสดงว่างเปล่าโดยไม่มีข้อความอธิบาย

---

## 3. โค้ดและสถาปัตยกรรม (Medium)

### TASK-007: รวมและจัดระเบียบ Types — [x] ทำเสร็จแล้ว

- **ปัญหา**: โปรเจกต์และ capability types อยู่ที่ `projectYaml.ts` / `capabilityYaml.ts`; `src/types.ts` มีแค่ Team/Topic/SubTopic/OrgTeam
- **งาน**:
  - ย้ายหรือ re-export types ที่เกี่ยวกับ Project และ Capability ไปที่ `src/types.ts` (หรือโมดูล `src/types/` ถ้าแยกไฟล์)
  - ลบ duplicate definition ของ `ProjectSummary` ใน `capability/manage.tsx` และ `ComponentSearchModal.tsx` ให้ใช้ type ร่วมจากที่เดียว
- **เกณฑ์สำเร็จ**: types เกี่ยวกับข้อมูลหลักอยู่ที่เดียว ไม่ซ้ำ definition

### TASK-008: สร้าง API helper / standardize การจัดการ Error — [x] ทำเสร็จแล้ว

- **ปัญหา**: บางที่เช็ค `res.ok` แล้ว return null/[] บางที่ throw; บางที่ใช้ `res.json().catch(() => ({}))` แล้วเช็ค `data.ok`
- **งาน**:
  - สร้าง helper เช่น `apiGet<T>(url)`, `apiPost<T>(url, body)` ที่ parse JSON, เช็ค `res.ok` และ return typed result หรือ throw พร้อมข้อความ
  - ค่อยๆ แทนที่ fetch โดยตรงในหน้าหลัก (project, capability, teams, tasks) ให้ใช้ helper
- **เกณฑ์สำเร็จ**: การเรียก API ใช้รูปแบบเดียวกัน และ error แสดงต่อผู้ใช้อย่างสม่ำเสมอ

### TASK-009: ลบ dependency ที่ไม่ใช้ — [x] ทำเสร็จแล้ว

- **ปัญหา**: `better-sqlite3` อยู่ใน dependencies แต่ไม่เห็นใช้ใน flow ปัจจุบัน
- **งาน**: ยืนยันว่าไม่มีโค้ดเรียกใช้ แล้วลบออกจาก `package.json` และรัน `npm install`
- **เกณฑ์สำเร็จ**: `npm run build` และ `npm run start` ทำงานได้ปกติ

---

## 4. การทดสอบและคุณภาพ (Low)

### TASK-010: เพิ่มการ validate ข้อมูลจาก API

- **งาน**: กำหนดรูปแบบ response ของแต่ละ endpoint (และ error shape) แล้วเพิ่มการ validate/parse (เช่น Zod หรือ type guard) ก่อนใช้ใน UI
- **เกณฑ์สำเร็จ**: ข้อมูลที่ผิดรูปแบบจากไฟล์/API ไม่ทำให้แอป crash

### TASK-011: เอกสาร API และ Data schema

- **งาน**: เขียนเอกสารสั้นๆ ระบุ endpoint, request/response shape และโครงสร้าง YAML (projects, teams, capability, _order) ใน `docs/` หรือใน README
- **เกณฑ์สำเร็จ**: developer คนใหม่อ่านแล้วโหลด/แก้ข้อมูลได้

---

## 5. สรุปลำดับแนะนำ

| ลำดับ | Task       | เหตุผล |
|-------|------------|--------|
| 1     | TASK-001   | แก้ความสับสนและความเสี่ยงข้อมูลไม่โหลด |
| 2     | TASK-002, TASK-003 | แก้ง่าย ได้ branding ชัด |
| 3     | TASK-007   | ลด duplicate และดูแล types ง่ายขึ้น |
| 4     | TASK-008   | ลด bug จาก error handling ไม่สม่ำเสมอ |
| 5     | TASK-004   | จัดการหน้า Login ตาม roadmap |
| 6     | TASK-006, TASK-009, TASK-010, TASK-011 | ปรับคุณภาพและเอกสารตามความพร้อม |

---

*อัปเดตล่าสุด: ดำเนินการตาม Task แล้ว (TASK-001–009 เสร็จ; TASK-010, 011 ไว้ทำต่อ)*
