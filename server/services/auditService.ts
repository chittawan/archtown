import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { SyncAuth } from '../types/syncAuth';
import { AUDIT_DIR, getSyncBackupPath } from './paths';
import { TABLE_WHITELIST } from './constants';
import type { AuditOpType } from './patchFieldUtils';

export type AuditRecord = {
  req_id: string;
  actor: string;
  actor_type: 'ai' | 'human';
  userId: string;
  version_before: number;
  version_after: number;
  ts: string;
  op: AuditOpType;
  table: string;
  id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  status: 'applied' | 'rejected';
  error: string | null;
};

export function makeReqId(): string {
  const rnd = crypto.randomBytes(3).toString('hex');
  return `r_${Date.now()}_${rnd}`;
}

export function auditDayFile(userId: string, dayUtc: string): string {
  return path.join(AUDIT_DIR, userId, `${dayUtc}.jsonl`);
}

export function appendAuditRecord(userId: string, record: AuditRecord): void {
  const day = record.ts.slice(0, 10);
  const file = auditDayFile(userId, day);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`, 'utf-8');
}

export function getPatchActor(userId: string, tokenAuth?: SyncAuth): { actor: string; actor_type: 'ai' | 'human' } {
  if (tokenAuth?.tokenId) {
    return { actor: `ai:${tokenAuth.tokenId}`, actor_type: 'ai' };
  }
  return { actor: `human:${userId}`, actor_type: 'human' };
}

export function readAllAuditRecordsForUser(userId: string): AuditRecord[] {
  const dir = path.join(AUDIT_DIR, userId);
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort();
  const out: AuditRecord[] = [];
  for (const f of files) {
    const fp = path.join(dir, f);
    const raw = fs.readFileSync(fp, 'utf-8');
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line) as AuditRecord);
      } catch {
        /* skip corrupt line */
      }
    }
  }
  return out;
}

export function queryAuditLines(
  userId: string,
  query: { date: string; table?: string; id?: string },
): AuditRecord[] {
  const { date, table: tableQ, id: idQ } = query;
  if (tableQ && idQ) {
    const all = readAllAuditRecordsForUser(userId);
    return all.filter((r) => r.table === tableQ && r.id === idQ).sort((a, b) => a.ts.localeCompare(b.ts));
  }
  const file = auditDayFile(userId, date);
  if (!fs.existsSync(file)) return [];
  const raw = fs.readFileSync(file, 'utf-8');
  const lines: AuditRecord[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      lines.push(JSON.parse(line) as AuditRecord);
    } catch {
      /* skip */
    }
  }
  return lines;
}

export type UndoResult =
  | { ok: true; reversed: number; version: number }
  | { ok: false; status: number; body: Record<string, unknown> };

export function performAuditUndo(userId: string, reqIdUndo: string): UndoResult {
  if (!reqIdUndo) {
    return { ok: false, status: 400, body: { ok: false, error: 'req_id required' } };
  }
  const all = readAllAuditRecordsForUser(userId);
  const batch = all.filter((r) => r.req_id === reqIdUndo).sort((a, b) => a.ts.localeCompare(b.ts));
  if (batch.length === 0) {
    return { ok: false, status: 404, body: { ok: false, error: 'req_id not found' } };
  }

  const backupFile = getSyncBackupPath(userId);
  if (!fs.existsSync(backupFile)) {
    return { ok: false, status: 404, body: { error: 'ยังไม่มีข้อมูลบน Cloud' } };
  }
  let backup: {
    version?: number;
    updated_at?: string;
    tables?: Record<string, unknown[]>;
  };
  try {
    backup = JSON.parse(fs.readFileSync(backupFile, 'utf-8')) as typeof backup;
  } catch {
    return { ok: false, status: 500, body: { ok: false, error: 'backup.json parse error' } };
  }

  const tables =
    backup.tables && typeof backup.tables === 'object' ? (backup.tables as Record<string, unknown[]>) : {};
  let reversed = 0;

  for (const line of [...batch].reverse()) {
    if (line.status !== 'applied') continue;
    if (!TABLE_WHITELIST.has(line.table)) continue;
    const tableRows = tables[line.table];
    if (!Array.isArray(tableRows)) continue;

    if (line.op === 'update' && line.before) {
      const idx = tableRows.findIndex((r) => r && typeof r === 'object' && (r as { id?: string }).id === line.id);
      if (idx === -1) continue;
      const row = tableRows[idx] as Record<string, unknown>;
      for (const [k, v] of Object.entries(line.before)) {
        row[k] = v;
      }
      reversed++;
    } else if (line.op === 'insert') {
      const idx = tableRows.findIndex((r) => r && typeof r === 'object' && (r as { id?: string }).id === line.id);
      if (idx !== -1) {
        tableRows.splice(idx, 1);
        reversed++;
      }
    } else if (line.op === 'delete' && line.before) {
      const exists = tableRows.some((r) => r && typeof r === 'object' && (r as { id?: string }).id === line.id);
      if (!exists) {
        tableRows.push({ ...line.before });
        reversed++;
      }
    }
  }

  if (reversed > 0) {
    const v0 = typeof backup.version === 'number' ? backup.version : Number(backup.version ?? 0);
    backup.version = v0 + 1;
    backup.updated_at = new Date().toISOString();
    fs.writeFileSync(backupFile, JSON.stringify(backup), 'utf-8');
  }

  const version = typeof backup.version === 'number' ? backup.version : Number(backup.version ?? 0);
  return { ok: true, reversed, version };
}
