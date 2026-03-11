export type Status = 'GREEN' | 'YELLOW' | 'RED';

/** Task ย่อยตาม Detail — แต่ละรายการเป็น Todo (มี checkbox done, dueDate optional) */
export interface SubTopicDetail {
  text: string;
  done: boolean;
  /** ISO date YYYY-MM-DD */
  dueDate?: string;
}

export interface SubTopic {
  id: string;
  title: string;
  status: Status;
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
