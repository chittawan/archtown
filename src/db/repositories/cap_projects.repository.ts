import * as client from '../client';

export interface CapProjectRow {
  cap_id: string;
  project_id: string;
  status: string | null;
  cols: number | null;
  sort_order: number;
}

const TABLE = 'cap_projects';

export async function getByCapId(capId: string): Promise<CapProjectRow[]> {
  const { resultRows } = await client.exec<CapProjectRow>(
    `SELECT cap_id, project_id, status, cols, sort_order FROM ${TABLE} WHERE cap_id = ? ORDER BY sort_order, project_id`,
    [capId]
  );
  return resultRows ?? [];
}

export async function insert(row: CapProjectRow): Promise<void> {
  await client.execRun(
    `INSERT INTO ${TABLE} (cap_id, project_id, status, cols, sort_order) VALUES (?, ?, ?, ?, ?)`,
    [row.cap_id, row.project_id, row.status ?? null, row.cols ?? null, row.sort_order]
  );
}

export async function deleteAll(): Promise<void> {
  await client.execRun(`DELETE FROM ${TABLE}`);
}
