/**
 * นำ ops จาก SSE / server patch มาใช้กับ SQLite โดยตรง (field-level merge แบบเดียวกับ server)
 */
import * as client from './client';
import { afterExternalTableMutation, ensureArchtownDataLoaded } from './archtownDb';

const TABLE_WHITELIST = new Set([
  'projects',
  'project_teams',
  'project_topics',
  'project_sub_topics',
  'project_sub_topic_details',
  'org_teams',
  'org_team_children',
  'capability_order',
  'caps',
  'cap_projects',
]);

function normalizeIsoTimestamp(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string') return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function isSafeFieldKey(key: string): boolean {
  if (!key) return false;
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') return false;
  return /^[a-zA-Z0-9_]+$/.test(key);
}

async function applyOneOp(raw: unknown): Promise<void> {
  const o = raw as { op?: string; table?: string };
  if (typeof o?.op !== 'string' || typeof o?.table !== 'string') {
    throw new Error('invalid op');
  }
  const { op, table } = o;
  if (!TABLE_WHITELIST.has(table)) {
    throw new Error(`Unknown table: ${table}`);
  }

  if (op === 'update') {
    const id = (o as { id?: unknown }).id;
    const fields = (o as { fields?: unknown }).fields;
    const field_updated_at = (o as { field_updated_at?: unknown }).field_updated_at;
    if (typeof id !== 'string' || !fields || typeof fields !== 'object' || !field_updated_at || typeof field_updated_at !== 'object') {
      throw new Error('update requires id, fields, field_updated_at');
    }
    const fu = field_updated_at as Record<string, string>;
    const { resultRows } = await client.exec<Record<string, unknown>>(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    if (!resultRows?.length) {
      throw new Error(`Row not found (id=${id})`);
    }
    const row = { ...resultRows[0] };

    for (const [fieldKey, fieldValue] of Object.entries(fields as Record<string, unknown>)) {
      if (!isSafeFieldKey(fieldKey)) continue;
      const incomingTs = normalizeIsoTimestamp(fu[fieldKey]) ?? new Date().toISOString();
      const tsKey = `${fieldKey}_updated_at`;
      const existingTs = normalizeIsoTimestamp(row[tsKey]);
      if (
        existingTs &&
        normalizeIsoTimestamp(incomingTs) &&
        new Date(existingTs).getTime() >= new Date(incomingTs).getTime()
      ) {
        continue;
      }
      row[fieldKey] = fieldValue;
      row[tsKey] = incomingTs;
    }

    const keys = Object.keys(row).filter((k) => isSafeFieldKey(k));
    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    await client.execRun(`UPDATE ${table} SET ${setClause} WHERE id = ?`, [...keys.map((k) => row[k] ?? null), id]);
    return;
  }

  if (op === 'insert') {
    const row = (o as { row?: unknown }).row;
    if (!row || typeof row !== 'object') throw new Error('insert requires row');
    const rec = row as Record<string, unknown>;
    const cols = Object.keys(rec).filter((k) => isSafeFieldKey(k));
    if (cols.length === 0) throw new Error('insert empty row');
    const placeholders = cols.map(() => '?').join(', ');
    const colList = cols.join(', ');
    await client.execRun(`INSERT INTO ${table} (${colList}) VALUES (${placeholders})`, cols.map((c) => rec[c] ?? null));
    return;
  }

  if (op === 'delete') {
    const composite_id = (o as { composite_id?: unknown }).composite_id;
    if (composite_id && typeof composite_id === 'object' && !Array.isArray(composite_id)) {
      const entries = Object.entries(composite_id as Record<string, unknown>).filter(([k]) => isSafeFieldKey(k));
      if (entries.length === 0) throw new Error('delete composite_id');
      const wheres = entries.map(([k]) => `${k} = ?`).join(' AND ');
      await client.execRun(
        `DELETE FROM ${table} WHERE ${wheres}`,
        entries.map(([, v]) => v),
      );
      return;
    }
    const id = (o as { id?: unknown }).id;
    if (typeof id !== 'string' || !id) throw new Error('delete requires id');
    await client.execRun(`DELETE FROM ${table} WHERE id = ?`, [id]);
    return;
  }

  throw new Error(`Unknown op: ${op}`);
}

export async function applyRemotePatchOpsToDb(ops: unknown[]): Promise<void> {
  if (ops.length === 0) return;
  await ensureArchtownDataLoaded();
  await client.runInTransaction(async () => {
    for (const op of ops) {
      await applyOneOp(op);
    }
  });
  afterExternalTableMutation();
}
