import * as client from '../client';

export interface ProjectTopicRow {
  id: string;
  team_id: string;
  title: string;
  sort_order: number;
}

const TABLE = 'project_topics';

export async function getByTeamId(teamId: string): Promise<ProjectTopicRow[]> {
  const { resultRows } = await client.exec<ProjectTopicRow>(
    `SELECT id, team_id, title, sort_order FROM ${TABLE} WHERE team_id = ? ORDER BY sort_order, id`,
    [teamId]
  );
  return resultRows ?? [];
}

export async function insert(row: ProjectTopicRow): Promise<void> {
  await client.execRun(
    `INSERT INTO ${TABLE} (id, team_id, title, sort_order) VALUES (?, ?, ?, ?)`,
    [row.id, row.team_id, row.title, row.sort_order]
  );
}

export async function deleteByTeamId(teamId: string): Promise<void> {
  await client.execRun(`DELETE FROM ${TABLE} WHERE team_id = ?`, [teamId]);
}
