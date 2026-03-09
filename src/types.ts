export type Status = 'GREEN' | 'YELLOW' | 'RED';

/** Task ย่อยตาม Detail — แต่ละรายการเป็น Todo (มี checkbox done) */
export interface SubTopicDetail {
  text: string;
  done: boolean;
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
