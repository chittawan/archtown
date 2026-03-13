export type Status = 'GREEN' | 'YELLOW' | 'RED';

/** สถานะของแต่ละ Todo item (Type Todos) */
export type TodoItemStatus = 'todo' | 'doing' | 'done';

/** Task ย่อยตาม Detail — รองรับทั้ง status (todo/doing/done) และ done (backward compat) */
export interface SubTopicDetail {
  text: string;
  /** Type Todos: สถานะรายการ — ถ้าไม่มีใช้ done เพื่อ backward compat */
  status?: TodoItemStatus;
  /** @deprecated ใช้ status === 'done' แทน — ยังรองรับตอนโหลด YAML เก่า */
  done?: boolean;
  /** ISO date YYYY-MM-DD */
  dueDate?: string;
}

/** ประเภทหัวข้อย่อย: Todos = รายการ Todo (text, status, dueDate) | status = ติดตามแค่ RED/YELLOW/GREEN */
export type SubTopicType = 'todos' | 'status';

export interface SubTopic {
  id: string;
  title: string;
  status: Status;
  /** ประเภท: todos = มีรายการ Todo, status = ติดตามสถานะอย่างเดียว */
  subTopicType?: SubTopicType;
  details: SubTopicDetail[];
}

export interface Topic {
  id: string;
  title: string;
  subTopics: SubTopic[];
}

export interface Team {
  id: string;
  name: string;
  topics: Topic[];
}

/** หน่วยงาน/ทีมองค์กร — 1 ทีม = 1 ไฟล์, มี Parent/Child */
export interface OrgTeam {
  /** slug ใช้เป็นชื่อไฟล์ (id) */
  id: string;
  name: string;
  owner: string;
  /** id (slug) ของทีมแม่, ว่างถ้าเป็นทีมระดับบน */
  parentId: string | null;
  /** id (slug) ของทีมลูก */
  childIds: string[];
}
