import * as client from '../client';

export interface CapRow {
  id: string;
  name: string;
  cols: number | null;
  rows: number | null;
}

const TABLE = 'caps';

export async function getById(id: string): Promise<CapRow | null> {
  const { resultRows } = await client.exec<CapRow>(`SELECT id, name, cols, rows FROM ${TABLE} WHERE id = ?`, [id]);
  return resultRows?.[0] ?? null;
}

export async function insert(row: CapRow): Promise<void> {
  await client.execRun(
    `INSERT INTO ${TABLE} (id, name, cols, rows) VALUES (?, ?, ?, ?)`,
    [row.id, row.name, row.cols ?? null, row.rows ?? null]
  );
}

export async function deleteAll(): Promise<void> {
  await client.execRun(`DELETE FROM ${TABLE}`);
}
