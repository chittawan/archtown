import * as client from '../client';

export interface CapabilityOrderRow {
  sort_order: number;
  cap_id: string;
}

const TABLE = 'capability_order';

export async function getAll(): Promise<CapabilityOrderRow[]> {
  const { resultRows } = await client.exec<CapabilityOrderRow>(
    `SELECT sort_order, cap_id FROM ${TABLE} ORDER BY sort_order`
  );
  return resultRows ?? [];
}

export async function insert(row: CapabilityOrderRow): Promise<void> {
  await client.execRun(`INSERT INTO ${TABLE} (sort_order, cap_id) VALUES (?, ?)`, [row.sort_order, row.cap_id]);
}

export async function deleteAll(): Promise<void> {
  await client.execRun(`DELETE FROM ${TABLE}`);
}
