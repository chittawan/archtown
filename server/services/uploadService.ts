import fs from 'fs';
import path from 'path';
import type { SyncAuth } from '../types/syncAuth';
import { getSyncBackupPath } from './paths';

export type UploadResult =
  | { ok: true; version: number; updated_at: string }
  | { ok: false; status: number; body: Record<string, unknown> };

export function runSyncUpload(input: {
  userId: string;
  syncAuth?: SyncAuth;
  payload: unknown;
  force: boolean;
}): UploadResult {
  const { userId, syncAuth, payload, force } = input;

  const isPlain = (payload as { schema_version?: unknown; tables?: unknown })?.schema_version != null && (payload as { tables?: unknown }).tables != null;
  const isEncrypted =
    typeof (payload as { enc?: unknown })?.enc === 'string' &&
    typeof (payload as { iv?: unknown })?.iv === 'string' &&
    typeof (payload as { salt?: unknown })?.salt === 'string';

  if (!payload || typeof payload !== 'object' || (!isPlain && !isEncrypted)) {
    return { ok: false, status: 400, body: { ok: false, error: 'รูปแบบข้อมูลไม่ถูกต้อง' } };
  }
  if (syncAuth && syncAuth.scope !== 'write') {
    return { ok: false, status: 403, body: { ok: false, error: 'insufficient scope' } };
  }

  const backupFile = getSyncBackupPath(userId);

  if (!force && fs.existsSync(backupFile)) {
    const existingJson = fs.readFileSync(backupFile, 'utf-8');
    let existing: { version?: number; updated_at?: string };
    try {
      existing = JSON.parse(existingJson) as { version?: number; updated_at?: string };
    } catch {
      existing = {};
    }
    const serverVersion = existing.version ?? 0;
    const payloadVersion = (payload as { version?: number }).version ?? 0;
    if (payloadVersion <= serverVersion) {
      return {
        ok: false,
        status: 409,
        body: {
          ok: false,
          error: 'Cloud มีข้อมูลใหม่กว่า',
          conflict: true,
          remoteVersion: serverVersion,
          remoteUpdatedAt: existing.updated_at ?? null,
        },
      };
    }
  }

  fs.mkdirSync(path.dirname(backupFile), { recursive: true });
  const { force: _f, ...payloadToWrite } = payload as { force?: boolean } & Record<string, unknown>;
  fs.writeFileSync(backupFile, JSON.stringify(payloadToWrite), 'utf-8');
  const written = payloadToWrite as { version?: number; updated_at?: string };
  const version = typeof written.version === 'number' ? written.version : 0;
  const updated_at =
    typeof written.updated_at === 'string' && written.updated_at ? written.updated_at : new Date().toISOString();
  return { ok: true, version, updated_at };
}
