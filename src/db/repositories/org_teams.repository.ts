import * as client from '../client';

export interface OrgTeamRow {
  id: string;
  name: string;
  owner: string;
  parent_id: string | null;
}

const TABLE = 'org_teams';

export async function getAll(): Promise<OrgTeamRow[]> {
  const { resultRows } = await client.exec<OrgTeamRow>(`SELECT id, name, owner, parent_id FROM ${TABLE} ORDER BY id`);
  return resultRows ?? [];
}

export async function getById(id: string): Promise<OrgTeamRow | null> {
  const { resultRows } = await client.exec<OrgTeamRow>(`SELECT id, name, owner, parent_id FROM ${TABLE} WHERE id = ?`, [id]);
  return resultRows?.[0] ?? null;
}

export async function replace(row: OrgTeamRow): Promise<void> {
  await client.execRun(
    `INSERT OR REPLACE INTO ${TABLE} (id, name, owner, parent_id) VALUES (?, ?, ?, ?)`,
    [row.id, row.name, row.owner, row.parent_id ?? null]
  );
}

export async function deleteById(id: string): Promise<void> {
  await client.execRun(`DELETE FROM ${TABLE} WHERE id = ?`, [id]);
}
