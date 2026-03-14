import * as client from '../client';

export interface ProjectTeamRow {
  id: string;
  project_id: string;
  name: string;
  sort_order: number;
}

const TABLE = 'project_teams';

export async function getByProjectId(projectId: string): Promise<ProjectTeamRow[]> {
  const { resultRows } = await client.exec<ProjectTeamRow>(
    `SELECT id, project_id, name, sort_order FROM ${TABLE} WHERE project_id = ? ORDER BY sort_order, id`,
    [projectId]
  );
  return resultRows ?? [];
}

export async function insert(row: ProjectTeamRow): Promise<void> {
  await client.execRun(
    `INSERT INTO ${TABLE} (id, project_id, name, sort_order) VALUES (?, ?, ?, ?)`,
    [row.id, row.project_id, row.name, row.sort_order]
  );
}

export async function deleteByProjectId(projectId: string): Promise<void> {
  await client.execRun(`DELETE FROM ${TABLE} WHERE project_id = ?`, [projectId]);
}
