# แผนปรับ ArchTown เป็น SQLite

เอกสารนี้อธิบายสิ่งที่ต้องทำเพื่อเปลี่ยนจากเก็บข้อมูลแบบไฟล์ YAML เป็น SQLite (เก็บเป็นไฟล์ `data/archtown.db`)

---

## 1. สิ่งที่ต้องเพิ่ม/เปลี่ยนโดยรวม

| หัวข้อ | รายละเอียด |
|--------|-------------|
| **Dependency** | เพิ่ม `better-sqlite3` (และ `@types/better-sqlite3` ใน devDependencies) |
| **Schema** | สร้างตารางใน SQLite ให้ตรงกับโครงสร้าง Projects, Teams, Capability |
| **Layer ใหม่** | โมดูลสำหรับเปิด DB, อ่าน/เขียน (แทน fs + yaml) |
| **Server (Production)** | แก้ `server/server.ts` ให้ใช้ DB แทนการอ่าน/เขียนไฟล์ |
| **Dev (Vite)** | ในโหมด dev ต้องเรียก API ที่ใช้ DB — ทางเลือก: ใช้ proxy ไปที่ Express หรือเพิ่ม SQLite ใน Vite middleware |
| **Migration ข้อมูลเดิม** | สคริปต์หนึ่งครั้ง: อ่าน YAML ใน `data/` แล้ว insert เข้า SQLite |
| **Backup / YAML export** | (ถ้าต้องการ) สคริปต์ export จาก DB เป็น YAML สำหรับ backup หรือ Git |

---

## 2. โครงสร้างฐานข้อมูล (Schema) ที่แนะนำ

ใช้โครงสร้างแบบ normalize เพื่อให้ query และความสัมพันธ์ชัดเจน

### 2.1 โปรเจกต์ (ซ้อนกัน: project → team → topic → sub_topic → detail)

```sql
-- โปรเจกต์หลัก
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT
);

-- ทีมภายในโปรเจกต์ (ลำดับใน project)
CREATE TABLE project_teams (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- หัวข้อภายในทีม
CREATE TABLE project_topics (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES project_teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- หัวข้อย่อย (sub topic) — มี status, sub_topic_type, details
CREATE TABLE project_sub_topics (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES project_topics(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'GREEN' CHECK (status IN ('GREEN','YELLOW','RED')),
  sub_topic_type TEXT DEFAULT 'todos' CHECK (sub_topic_type IN ('todos','status')),
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- รายการ detail (todo item) ภายใต้ sub topic
CREATE TABLE project_sub_topic_details (
  id TEXT PRIMARY KEY,
  sub_topic_id TEXT NOT NULL REFERENCES project_sub_topics(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'todo' CHECK (status IN ('todo','doing','done')),
  due_date TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_project_teams_project ON project_teams(project_id);
CREATE INDEX idx_project_topics_team ON project_topics(team_id);
CREATE INDEX idx_project_sub_topics_topic ON project_sub_topics(topic_id);
CREATE INDEX idx_project_details_sub_topic ON project_sub_topic_details(sub_topic_id);
```

### 2.2 ทีมองค์กร (OrgTeam)

```sql
CREATE TABLE org_teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner TEXT NOT NULL DEFAULT '',
  parent_id TEXT REFERENCES org_teams(id) ON DELETE SET NULL
);

-- ความสัมพันธ์ parent–child (childIds) — เก็บเป็นแถวต่อหนึ่งลูก
CREATE TABLE org_team_children (
  parent_id TEXT NOT NULL REFERENCES org_teams(id) ON DELETE CASCADE,
  child_id TEXT NOT NULL REFERENCES org_teams(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (parent_id, child_id)
);
```

### 2.3 Capability (กลุ่ม Cap + ลำดับ + โปรเจกต์ในแต่ละ Cap)

```sql
-- ลำดับกลุ่ม (cap order)
CREATE TABLE capability_order (
  sort_order INTEGER NOT NULL,
  cap_id TEXT NOT NULL,
  PRIMARY KEY (sort_order)
);

-- ข้อมูลแต่ละ Cap
CREATE TABLE caps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cols INTEGER CHECK (cols IN (12,6,4,3)),
  rows INTEGER
);

-- โปรเจกต์ที่อยู่ใน Cap (กับ status, cols และลำดับ)
CREATE TABLE cap_projects (
  cap_id TEXT NOT NULL REFERENCES caps(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT CHECK (status IN ('RED','YELLOW','GREEN')),
  cols INTEGER CHECK (cols IN (12,6,4,3)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (cap_id, project_id)
);
```

---

## 3. สิ่งที่ต้องทำเป็นขั้นตอน

### ขั้นที่ 1: ติดตั้งและเตรียม DB

- เพิ่ม dependency: `better-sqlite3`, `@types/better-sqlite3` (dev)
- สร้างโฟลเดอร์/ path สำหรับ DB เช่น `data/archtown.db` (หรือ `process.cwd()/data/archtown.db`)
- สร้างโมดูล `server/db.ts` (หรือ `src/lib/db.ts` ใช้เฉพาะฝั่ง server):
  - เปิด SQLite จาก path ข้างบน
  - รัน schema (CREATE TABLE ถ้ายังไม่มีตาราง) — แยกเป็นไฟล์ `server/schema.sql` ก็ได้
  - export ฟังก์ชันสำหรับอ่าน/เขียน projects, teams, capability ตาม API ปัจจุบัน

### ขั้นที่ 2: เขียนฟังก์ชันอ่าน/เขียนต่อ DB

ในโมดูล DB (หรือแยกเป็น `server/projectsDb.ts`, `server/teamsDb.ts`, `server/capabilityDb.ts`):

- **Projects**
  - `listProjects()` → รายการ `{ id, name, description, summaryStatus }` (summaryStatus คำนวณจาก project_sub_topics.status)
  - `getProject(id)` → โปรเจกต์เต็มพร้อม teams → topics → subTopics → details (หรือ query แยกแล้วประกอบเป็น object ตาม `ProjectData`)
  - `createProject(id, name)` → insert project
  - `saveProject(id, data: ProjectData)` → อัปเดต project + ลบ/insert teams, topics, sub_topics, details ตาม id
- **Teams**
  - `listTeamIds()` → `string[]`
  - `getTeam(id)` → OrgTeam
  - `saveTeam(id, data: OrgTeam)` → upsert org_teams + org_team_children
- **Capability**
  - `getCapabilityLayout()` → `{ capOrder, caps }` (อ่านจาก capability_order + caps + cap_projects)
  - `saveCapabilityLayout(layout)` → อัปเดต capability_order, caps, cap_projects

ใช้ transaction ใน SQLite สำหรับการบันทึกที่ต้องอัปเดตหลายตาราง (เช่น saveProject, saveCapabilityLayout)

### ขั้นที่ 3: แก้ Production Server

- ใน `server/server.ts`:
  - ลบการอ่าน/เขียน fs + YAML สำหรับ projects, teams, capability
  - เรียกฟังก์ชันจากโมดูล DB แทน (เช่น `listProjects()`, `getProject(id)`, `saveProject(...)`)
  - เก็บ response shape ของ API ให้เหมือนเดิม เช่น `GET /api/projects` → `{ projects: [...] }`, `GET /api/projects/:id` → `{ id, data }`, `POST /api/save-project` → `{ ok, id }` เป็นต้น
- Endpoint ที่ต้องสอดคล้องกับของเดิม:
  - `GET/POST /api/projects`, `GET /api/projects/:id`, `POST /api/projects/create`, `POST /api/save-project`
  - `GET /api/teams`, `GET /api/teams/:id`, `POST /api/teams/save`
  - `GET /api/capability`, `GET /api/capability/summary`, `POST /api/capability/save`

### ขั้นที่ 4: โหมด Dev (Vite)

ทางเลือกหลัก:

- **A) Proxy ไป Express (แนะนำ)**  
  - รัน Express ที่พอร์ตหนึ่ง (เช่น 3001) โดยใช้ DB ตัวเดียวกัน  
  - ใน Vite ตั้ง `server.proxy`: `/api` → `http://localhost:3001`  
  - สคริปต์ `dev` รันทั้ง Vite และ Express (concurrently หรือใช้ `vite-plugin-express` ฯลฯ)  
  - โหมด dev จะใช้ API จาก Express = ใช้ SQLite เหมือน production  

- **B) ใช้ SQLite ใน Vite middleware**  
  - ใน `vite.config.ts` ใช้ `better-sqlite3` (ต้องใช้จาก Node) เปิด DB ที่ path เดียวกับ server  
  - แทนที่ logic ใน middleware ที่ handle `/api/*` ให้เรียกฟังก์ชันในโมดูล DB แทน fs  
  - ข้อควรระวัง: path ของไฟล์ DB ต้องสอดคล้องกับที่ server ใช้ (เช่น `path.resolve(__dirname, 'data', 'archtown.db')`)  

ถ้าไม่ต้องการให้โหมด dev ใช้ DB ในขั้นแรก สามารถเก็บโหมด dev ไว้ใช้ YAML อย่างเดียว แล้วค่อยรวมในขั้นถัดไป

### ขั้นที่ 5: Migration ข้อมูลเดิม (YAML → SQLite)

- สคริปต์หนึ่งครั้ง (เช่น `scripts/migrate-yaml-to-sqlite.ts`):
  - อ่านทุกไฟล์ใน `data/projects/*.yaml`, `data/teams/*.yaml`, `data/capability/*.yaml` และ `data/capability/_order.yaml`
  - ใช้ parser เดิม (`yamlToProject`, `yamlToOrgTeam`, `yamlToCap`, `yamlToCapOrder`) แปลงเป็น in-memory object
  - เปิด DB (หรือเรียกโมดูลที่เปิด DB), สร้างตารางถ้ายังไม่มี
  - insert ข้อมูลเข้า SQLite ตาม schema ข้างบน (สร้าง id สำหรับ project_teams, project_topics, … ถ้า YAML ไม่มี id ใช้ `genId()` แบบใน projectYaml)
- รันสคริปต์เมื่อพร้อมย้ายข้อมูล แล้วทดสอบว่า API คืนค่าเหมือนเดิม
- (ถ้าต้องการ) เก็บโฟลเดอร์ YAML ไว้เป็น backup หรือย้ายไป `data/backup-yaml/`

### ขั้นที่ 6: (ถ้าต้องการ) Export / Backup เป็น YAML

- สคริปต์หรือ endpoint ที่อ่านจาก DB แล้ว export เป็นโครงสร้าง YAML เดิม (ใช้ `projectToYaml`, `orgTeamToYaml`, `capToYaml`, `capOrderToYaml`) เพื่อ backup หรือใส่ใน Git

---

## 4. สรุป Checklist

- [ ] ติดตั้ง `better-sqlite3` และ `@types/better-sqlite3`
- [ ] สร้าง `server/schema.sql` (หรือรัน CREATE ใน `server/db.ts`)
- [ ] สร้างโมดูลเปิด DB และรัน schema
- [ ] เขียนฟังก์ชัน DB: projects (list, get, create, save)
- [ ] เขียนฟังก์ชัน DB: teams (list ids, get, save)
- [ ] เขียนฟังก์ชัน DB: capability (get layout, save layout) + summary
- [ ] แก้ `server/server.ts` ให้ใช้ฟังก์ชัน DB แทน fs/yaml
- [ ] จัดการโหมด dev: proxy ไป Express หรือใช้ SQLite ใน Vite middleware
- [ ] สคริปต์ migration YAML → SQLite และรันหนึ่งครั้ง
- [ ] ทดสอบทุก endpoint และทดสอบโหมด dev/build
- [ ] (ถ้าต้องการ) สคริปต์ export DB → YAML

---

## 5. หมายเหตุ

- **ที่เก็บไฟล์ DB**: ใช้ `data/archtown.db` ให้ backup = copy โฟลเดอร์ `data/` ได้เหมือนเดิม
- **ID**: โปรเจกต์/ทีมองค์กร/Cap ใช้ id แบบ string (slug) เหมือนเดิม; แถวย่อย (project_teams, project_topics, …) ใช้ id ที่ generate แบบเดิมหรือ UUID
- **API และ Frontend**: ไม่ต้องเปลี่ยน request/response ของ API และไม่ต้องแก้ frontend ถ้าทำให้ response shape เหมือนเดิม
