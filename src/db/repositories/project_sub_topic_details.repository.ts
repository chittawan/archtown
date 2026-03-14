import * as client from '../client';

export interface ProjectSubTopicDetailRow {
  id: string;
  sub_topic_id: string;
  text: string;
  description: string | null;
  status: string;
  due_date: string | null;
  sort_order: number;
}

const TABLE = 'project_sub_topic_details';

export async function getBySubTopicId(subTopicId: string): Promise<ProjectSubTopicDetailRow[]> {
  const { resultRows } = await client.exec<ProjectSubTopicDetailRow>(
    `SELECT id, sub_topic_id, text, description, status, due_date, sort_order FROM ${TABLE} WHERE sub_topic_id = ? ORDER BY sort_order, id`,
    [subTopicId]
  );
  return resultRows ?? [];
}

export async function insert(row: ProjectSubTopicDetailRow): Promise<void> {
  await client.execRun(
    `INSERT INTO ${TABLE} (id, sub_topic_id, text, description, status, due_date, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.sub_topic_id, row.text, row.description ?? null, row.status, row.due_date ?? null, row.sort_order]
  );
}

export async function deleteBySubTopicId(subTopicId: string): Promise<void> {
  await client.execRun(`DELETE FROM ${TABLE} WHERE sub_topic_id = ?`, [subTopicId]);
}
