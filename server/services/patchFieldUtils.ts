export function normalizeIsoTimestamp(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string') return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function isSafeFieldKey(key: string): boolean {
  if (!key) return false;
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') return false;
  return /^[a-zA-Z0-9_]+$/.test(key);
}

export function pickFieldSnapshotsFromRow(row: Record<string, unknown>, fieldKeys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const fk of fieldKeys) {
    if (!isSafeFieldKey(fk)) continue;
    out[fk] = row[fk];
    out[`${fk}_updated_at`] = row[`${fk}_updated_at`];
  }
  return out;
}

export function shallowCloneRow(row: unknown): Record<string, unknown> {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return {};
  return { ...(row as Record<string, unknown>) };
}

export type AuditOpType = 'update' | 'insert' | 'delete';

export function coerceAuditOpType(raw: unknown): AuditOpType {
  if (raw === 'update' || raw === 'insert' || raw === 'delete') return raw;
  return 'update';
}

export function extractTableFromRawOp(raw: unknown): string {
  if (raw && typeof raw === 'object' && typeof (raw as { table?: unknown }).table === 'string') {
    return (raw as { table: string }).table;
  }
  return '';
}

export function extractIdFromRawOp(raw: unknown): string {
  if (raw && typeof raw === 'object') {
    const o = raw as { id?: unknown; row?: { id?: unknown }; composite_id?: unknown };
    if (typeof o.id === 'string') return o.id;
    if (o.row && typeof o.row === 'object' && typeof o.row.id === 'string') return o.row.id;
    if (o.composite_id && typeof o.composite_id === 'object') {
      // Use JSON string so AuditRecord.id remains a string.
      // (Example: { parent_id: 'x', child_id: 'y' })
      return JSON.stringify(o.composite_id);
    }
  }
  return '';
}
