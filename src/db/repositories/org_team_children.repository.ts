import * as client from '../client';

export interface OrgTeamChildRow {
  parent_id: string;
  child_id: string;
  sort_order: number;
}

const TABLE = 'org_team_children';

export async function getByParentId(parentId: string): Promise<OrgTeamChildRow[]> {
  const { resultRows } = await client.exec<OrgTeamChildRow>(
    `SELECT parent_id, child_id, sort_order FROM ${TABLE} WHERE parent_id = ? ORDER BY sort_order, child_id`,
    [parentId]
  );
  return resultRows ?? [];
}

export async function insert(row: OrgTeamChildRow): Promise<void> {
  await client.execRun(
    `INSERT OR REPLACE INTO ${TABLE} (parent_id, child_id, sort_order) VALUES (?, ?, ?)`,
    [row.parent_id, row.child_id, row.sort_order]
  );
}

export async function deleteByParentId(parentId: string): Promise<void> {
  await client.execRun(`DELETE FROM ${TABLE} WHERE parent_id = ?`, [parentId]);
}
