import fs from 'fs';
import type { SyncAuth } from '../types/syncAuth';
import { getSyncBackupPath } from './paths';
import { TABLE_WHITELIST } from './constants';
import {
  coerceAuditOpType,
  extractIdFromRawOp,
  extractTableFromRawOp,
  isSafeFieldKey,
  normalizeIsoTimestamp,
  pickFieldSnapshotsFromRow,
  shallowCloneRow,
} from './patchFieldUtils';
import type { AuditRecord } from './auditService';
import { appendAuditRecord, getPatchActor, makeReqId } from './auditService';

type PendingAudit = {
  ts: string;
  op: 'update' | 'insert' | 'delete';
  table: string;
  id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  status: 'applied' | 'rejected';
  error: string | null;
};

export type SyncPatchSuccess = {
  ok: true;
  version: number;
  applied: number;
  rejected: Array<{ index: number; error: string }>;
};

export type SyncPatchFailure = { ok: false; status: number; body: Record<string, unknown> };

export function runSyncPatch(input: {
  userId: string;
  tokenAuth?: SyncAuth;
  baseVersion: number;
  ops: unknown[];
}): SyncPatchSuccess | SyncPatchFailure {
  const { userId, tokenAuth, baseVersion, ops } = input;

  if (tokenAuth && tokenAuth.scope !== 'write') {
    return { ok: false, status: 403, body: { ok: false, error: 'insufficient scope' } };
  }

  if (typeof baseVersion !== 'number' || !Array.isArray(ops)) {
    return {
      ok: false,
      status: 400,
      body: { ok: false, error: 'Invalid payload. Expect { base_version:number, ops:[] }' },
    };
  }

  if (ops.length > 100) {
    return { ok: false, status: 400, body: { ok: false, error: 'ops limit exceeded (max 100)' } };
  }

  const backupFile = getSyncBackupPath(userId);
  if (!fs.existsSync(backupFile)) {
    return { ok: false, status: 404, body: { error: 'ยังไม่มีข้อมูลบน Cloud' } };
  }

  const json = fs.readFileSync(backupFile, 'utf-8');
  let backup: {
    version?: number;
    updated_at?: string;
    tables?: Record<string, unknown[]>;
  };
  try {
    backup = JSON.parse(json) as typeof backup;
  } catch {
    return { ok: false, status: 500, body: { ok: false, error: 'backup.json parse error' } };
  }

  const serverVersion = typeof backup?.version === 'number' ? backup.version : Number(backup?.version ?? 0);
  const versionBefore = typeof backup?.version === 'number' ? backup.version : serverVersion;
  if (baseVersion < serverVersion) {
    return {
      ok: false,
      status: 409,
      body: {
        ok: false,
        error: 'base_version is older than server version',
        conflict: true,
        remoteVersion: serverVersion,
        remoteUpdatedAt: backup?.updated_at ?? null,
      },
    };
  }

  const tables =
    backup?.tables && typeof backup.tables === 'object' ? { ...backup.tables } : ({} as Record<string, unknown[]>);
  let applied = 0;
  const rejected: Array<{ index: number; error: string }> = [];

  const reqId = makeReqId();
  const { actor, actor_type } = getPatchActor(userId, tokenAuth);
  const pendingAudits: PendingAudit[] = [];

  for (let i = 0; i < ops.length; i++) {
    const rawOp = ops[i];
    const ts = new Date().toISOString();
    try {
      const opType = (rawOp as { op?: unknown })?.op;
      const table = (rawOp as { table?: unknown })?.table;
      if (typeof opType !== 'string' || typeof table !== 'string') {
        throw new Error('op must include { op, table }');
      }
      if (!TABLE_WHITELIST.has(table)) {
        throw new Error(`Unknown table: ${table}`);
      }
      const tableRows = tables[table];
      if (!Array.isArray(tableRows)) {
        throw new Error(`Unknown table: ${table}`);
      }

      if (opType === 'update') {
        const id = (rawOp as { id?: unknown })?.id;
        const fields = (rawOp as { fields?: unknown })?.fields;
        const fieldUpdatedAt = (rawOp as { field_updated_at?: unknown })?.field_updated_at;
        if (typeof id !== 'string' || !fields || typeof fields !== 'object') {
          throw new Error('update requires { id:string, fields:object }');
        }
        if (!fieldUpdatedAt || typeof fieldUpdatedAt !== 'object') {
          throw new Error('update requires { field_updated_at:object }');
        }

        const rowIndex = tableRows.findIndex((r) => r && typeof r === 'object' && (r as { id?: string }).id === id);
        if (rowIndex === -1) throw new Error(`Row not found (id=${id})`);

        const row = tableRows[rowIndex] as Record<string, unknown>;
        const fieldKeys = Object.keys(fields as Record<string, unknown>);
        const beforeSnap = pickFieldSnapshotsFromRow(row, fieldKeys);

        let changedAny = false;
        for (const [fieldKey, fieldValue] of Object.entries(fields as Record<string, unknown>)) {
          if (!isSafeFieldKey(fieldKey)) continue;
          const incomingRaw = (fieldUpdatedAt as Record<string, unknown>)[fieldKey];
          const incomingTs = normalizeIsoTimestamp(incomingRaw) ?? new Date().toISOString();

          const tsKey = `${fieldKey}_updated_at`;
          const existingRaw = row[tsKey];
          const existingTs = normalizeIsoTimestamp(existingRaw);

          if (
            existingTs &&
            normalizeIsoTimestamp(incomingTs) &&
            new Date(existingTs).getTime() >= new Date(incomingTs).getTime()
          ) {
            continue;
          }

          row[fieldKey] = fieldValue;
          row[tsKey] = incomingTs;
          changedAny = true;
        }

        const afterSnap = pickFieldSnapshotsFromRow(row, fieldKeys);
        if (changedAny || fieldKeys.length > 0) applied++;

        pendingAudits.push({
          ts,
          op: 'update',
          table,
          id,
          before: beforeSnap,
          after: afterSnap,
          status: 'applied',
          error: null,
        });
      } else if (opType === 'insert') {
        const row = (rawOp as { row?: unknown })?.row;
        if (!row || typeof row !== 'object') throw new Error('insert requires { row:object }');
        const rid = (row as { id?: unknown }).id;
        if (typeof rid !== 'string' || !rid) throw new Error('insert row must include { id:string }');

        const exists = tableRows.some((r) => r && typeof r === 'object' && (r as { id?: string }).id === rid);
        if (exists) throw new Error(`Row already exists (id=${rid})`);

        tableRows.push(row as Record<string, unknown>);
        applied++;

        pendingAudits.push({
          ts,
          op: 'insert',
          table,
          id: rid,
          before: null,
          after: shallowCloneRow(row),
          status: 'applied',
          error: null,
        });
      } else if (opType === 'delete') {
        const id = (rawOp as { id?: unknown })?.id;
        if (typeof id !== 'string' || !id) throw new Error('delete requires { id:string }');
        const idx = tableRows.findIndex((r) => r && typeof r === 'object' && (r as { id?: string }).id === id);
        if (idx === -1) throw new Error(`Row not found (id=${id})`);
        const beforeSnap = shallowCloneRow(tableRows[idx]);
        tableRows.splice(idx, 1);
        applied++;

        pendingAudits.push({
          ts,
          op: 'delete',
          table,
          id,
          before: beforeSnap,
          after: null,
          status: 'applied',
          error: null,
        });
      } else {
        throw new Error(`Unknown op: ${String(opType)}`);
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      rejected.push({ index: i, error: errMsg });
      pendingAudits.push({
        ts,
        op: coerceAuditOpType((rawOp as { op?: unknown })?.op),
        table: extractTableFromRawOp(rawOp),
        id: extractIdFromRawOp(rawOp),
        before: null,
        after: null,
        status: 'rejected',
        error: errMsg,
      });
    }
  }

  const versionAfter = applied > 0 ? versionBefore + 1 : versionBefore;
  if (applied > 0) {
    backup.version = versionAfter;
    backup.updated_at = new Date().toISOString();
    backup.tables = tables;
    fs.writeFileSync(backupFile, JSON.stringify(backup), 'utf-8');
  }

  for (const p of pendingAudits) {
    const record: AuditRecord = {
      req_id: reqId,
      actor,
      actor_type,
      userId,
      version_before: versionBefore,
      version_after: versionAfter,
      ts: p.ts,
      op: p.op,
      table: p.table,
      id: p.id,
      before: p.before,
      after: p.after,
      status: p.status,
      error: p.error,
    };
    appendAuditRecord(userId, record);
  }

  return {
    ok: true,
    version: versionAfter,
    applied,
    rejected,
  };
}
