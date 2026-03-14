# Repositories Layer

ชั้น Repository แยกตาม table และ domain สำหรับให้ frontend เรียกใช้ แล้วเชื่อมกับ SQLite DB ผ่าน `client`.

## โครงสร้าง

```
Frontend (pages/components)
    │
    ├── เรียก archtownDb.* (facade เดิม)
    │       │
    │       └── delegate ไปที่ domain repositories
    │
    └── หรือ import จาก repositories โดยตรง
            │
            ├── projectRepository   (domain: projects + project_teams + ...)
            ├── orgTeamRepository   (domain: org_teams + org_team_children)
            └── capabilityRepository (domain: capability_order + caps + cap_projects)
                    │
                    └── ใช้ table repositories + client.runInTransaction
                            │
                            └── client (exec, execRun) → SQLite WASM
```

## Table repositories (ต่อตาราง)

| ไฟล์ | ตาราง | เมธอดหลัก |
|------|--------|-----------|
| `projects.repository.ts` | projects | getAll, getById, insert, replace, deleteById |
| `project_teams.repository.ts` | project_teams | getByProjectId, insert, deleteByProjectId |
| `project_topics.repository.ts` | project_topics | getByTeamId, insert, deleteByTeamId |
| `project_sub_topics.repository.ts` | project_sub_topics | getByTopicId, insert, deleteByTopicId |
| `project_sub_topic_details.repository.ts` | project_sub_topic_details | getBySubTopicId, insert, deleteBySubTopicId |
| `org_teams.repository.ts` | org_teams | getAll, getById, replace, deleteById |
| `org_team_children.repository.ts` | org_team_children | getByParentId, insert, deleteByParentId |
| `capability_order.repository.ts` | capability_order | getAll, insert, deleteAll |
| `caps.repository.ts` | caps | getById, insert, deleteAll |
| `cap_projects.repository.ts` | cap_projects | getByCapId, insert, deleteAll |

## Domain repositories (สำหรับหน้า frontend)

- **project.repository**: `listProjects`, `getProject`, `createProject`, `saveProject`
- **org_team.repository**: `listTeamIds`, `getTeam`, `saveTeam`
- **capability.repository**: `getCapabilityLayout`, `saveCapabilityLayout`, `getCapabilitySummary`

## การใช้

```ts
// แบบเดิม (ผ่าน archtownDb)
import * as archtownDb from '@/db/archtownDb';
const { projects } = await archtownDb.listProjects();
await archtownDb.saveProject(name, data);

// หรือเรียก domain repository โดยตรง
import { projectRepository } from '@/db/repositories';
const { projects } = await projectRepository.listProjects();
await projectRepository.saveProject(name, data);

// ใช้ table repository โดยตรง (เมื่อต้องการ CRUD ระดับตาราง)
import { projectsTable } from '@/db/repositories';
const row = await projectsTable.getById('my-project');
```
