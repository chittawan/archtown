import * as client from '../client';

export interface ProjectSubTopicRow {
  id: string;
  topic_id: string;
  title: string;
  status: string;
  sub_topic_type: string;
  sort_order: number;
}

const TABLE = 'project_sub_topics';

export async function getByTopicId(topicId: string): Promise<ProjectSubTopicRow[]> {
  const { resultRows } = await client.exec<ProjectSubTopicRow>(
    `SELECT id, topic_id, title, status, sub_topic_type, sort_order FROM ${TABLE} WHERE topic_id = ? ORDER BY sort_order, id`,
    [topicId]
  );
  return resultRows ?? [];
}

export async function insert(row: ProjectSubTopicRow): Promise<void> {
  await client.execRun(
    `INSERT INTO ${TABLE} (id, topic_id, title, status, sub_topic_type, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
    [row.id, row.topic_id, row.title, row.status, row.sub_topic_type, row.sort_order]
  );
}

export async function deleteByTopicId(topicId: string): Promise<void> {
  await client.execRun(`DELETE FROM ${TABLE} WHERE topic_id = ?`, [topicId]);
}
