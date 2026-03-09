export type Status = 'GREEN' | 'YELLOW' | 'RED';

export interface SubTopic {
  id: string;
  title: string;
  status: Status;
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
