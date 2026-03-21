import { readAllAuditRecordsForUser, type AuditRecord } from './auditService';

export type ReplayPatchPayload = {
  version: number;
  ops: unknown[];
  actor: string;
  ts: string;
};

function auditRecordToPatchOp(r: AuditRecord): unknown | null {
  if (r.status !== 'applied') return null;
  try {
    if (r.op === 'update' && r.after && typeof r.after === 'object') {
      const fields: Record<string, unknown> = {};
      const field_updated_at: Record<string, string> = {};
      const after = r.after as Record<string, unknown>;
      for (const [k, v] of Object.entries(after)) {
        if (k.endsWith('_updated_at')) continue;
        fields[k] = v;
        const tsKey = `${k}_updated_at`;
        const tsVal = after[tsKey];
        field_updated_at[k] =
          typeof tsVal === 'string' && tsVal ? tsVal : typeof r.ts === 'string' ? r.ts : new Date().toISOString();
      }
      if (Object.keys(fields).length === 0) return null;
      return { op: 'update' as const, table: r.table, id: r.id, fields, field_updated_at };
    }
    if (r.op === 'insert' && r.after && typeof r.after === 'object') {
      return { op: 'insert' as const, table: r.table, row: r.after };
    }
    if (r.op === 'delete') {
      try {
        const parsed = JSON.parse(r.id) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed as object).length > 0) {
          return { op: 'delete' as const, table: r.table, composite_id: parsed as Record<string, unknown> };
        }
      } catch {
        /* single id */
      }
      return { op: 'delete' as const, table: r.table, id: r.id };
    }
  } catch {
    return null;
  }
  return null;
}

/** สร้างรายการ patch events สำหรับ SSE replay หลัง Last-Event-ID (ใช้ version_after เป็น id) */
export function buildReplayPatchEvents(userId: string, afterVersion: number): ReplayPatchPayload[] {
  const all = readAllAuditRecordsForUser(userId);
  const applied = all.filter((r) => r.status === 'applied' && r.version_after > afterVersion);
  const byVersion = new Map<number, AuditRecord[]>();
  for (const r of applied) {
    const v = r.version_after;
    const arr = byVersion.get(v) ?? [];
    arr.push(r);
    byVersion.set(v, arr);
  }
  const versions = [...byVersion.keys()].sort((a, b) => a - b);
  const out: ReplayPatchPayload[] = [];
  for (const v of versions) {
    const lines = (byVersion.get(v) ?? []).slice().sort((a, b) => a.ts.localeCompare(b.ts));
    if (lines.length === 0) continue;
    const ops: unknown[] = [];
    for (const line of lines) {
      const op = auditRecordToPatchOp(line);
      if (op != null) ops.push(op);
    }
    if (ops.length === 0) continue;
    const first = lines[0];
    const ts = lines.map((l) => l.ts).sort()[lines.length - 1] ?? first.ts;
    out.push({
      version: v,
      ops,
      actor: first.actor,
      ts,
    });
  }
  return out;
}
