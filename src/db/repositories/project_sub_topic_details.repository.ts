import * as client from '../client';

export interface ProjectSubTopicDetailRow {
  id: string;
  sub_topic_id: string;
  text: string;
  description: string | null;
  status: string;
  due_date: string | null;
  sort_order: number;
  health: string | null;
  health_note: string | null;
  health_reviewed_at: string | null;
  health_updated_at: string | null;
  health_note_updated_at: string | null;
  health_reviewed_at_updated_at: string | null;
}

const TABLE = 'project_sub_topic_details';

export async function getBySubTopicId(subTopicId: string): Promise<ProjectSubTopicDetailRow[]> {
  const { resultRows } = await client.exec<ProjectSubTopicDetailRow>(
    `SELECT id, sub_topic_id, text, description, status, due_date, sort_order,
            health, health_note, health_reviewed_at,
            health_updated_at, health_note_updated_at, health_reviewed_at_updated_at
     FROM ${TABLE} WHERE sub_topic_id = ? ORDER BY sort_order, id`,
    [subTopicId]
  );
  return resultRows ?? [];
}

export async function insert(row: ProjectSubTopicDetailRow): Promise<void> {
  await client.execRun(
    `INSERT INTO ${TABLE} (id, sub_topic_id, text, description, status, due_date, sort_order,
      health, health_note, health_reviewed_at, health_updated_at, health_note_updated_at, health_reviewed_at_updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.sub_topic_id,
      row.text,
      row.description ?? null,
      row.status,
      row.due_date ?? null,
      row.sort_order,
      row.health ?? null,
      row.health_note ?? null,
      row.health_reviewed_at ?? null,
      row.health_updated_at ?? null,
      row.health_note_updated_at ?? null,
      row.health_reviewed_at_updated_at ?? null,
    ]
  );
}

export async function deleteBySubTopicId(subTopicId: string): Promise<void> {
  await client.execRun(`DELETE FROM ${TABLE} WHERE sub_topic_id = ?`, [subTopicId]);
}
