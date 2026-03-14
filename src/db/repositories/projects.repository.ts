import * as client from '../client';

export interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
}

const TABLE = 'projects';

export async function getAll(): Promise<ProjectRow[]> {
  const { resultRows } = await client.exec<ProjectRow>(`SELECT id, name, description FROM ${TABLE} ORDER BY id`);
  return resultRows ?? [];
}

export async function getById(id: string): Promise<ProjectRow | null> {
  const { resultRows } = await client.exec<ProjectRow>(`SELECT id, name, description FROM ${TABLE} WHERE id = ?`, [id]);
  return resultRows?.[0] ?? null;
}

export async function insert(row: ProjectRow): Promise<void> {
  await client.execRun(
    `INSERT INTO ${TABLE} (id, name, description) VALUES (?, ?, ?)`,
    [row.id, row.name, row.description ?? null]
  );
}

export async function replace(row: ProjectRow): Promise<void> {
  await client.execRun(
    `INSERT OR REPLACE INTO ${TABLE} (id, name, description) VALUES (?, ?, ?)`,
    [row.id, row.name, row.description ?? null]
  );
}

export async function deleteById(id: string): Promise<void> {
  await client.execRun(`DELETE FROM ${TABLE} WHERE id = ?`, [id]);
}
