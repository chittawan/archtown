import { SYNC_LAST_UPLOADED_KEY } from './archtownDb';
import { getPendingSyncOps, consumePendingSyncOpsHead } from './pendingSyncOps';
import { getGoogleUserId, getTokenLoginToken } from '../lib/googleAuth';

const SYNC_VERSION_URL = '/api/sync/version';
const SYNC_PATCH_URL = '/api/sync/patch';

type SyncPatchSuccess = {
  ok: true;
  version: number;
  applied: number;
  rejected: Array<{ index: number; error: string }>;
};

type SyncPatchFailure = {
  ok: false;
  status: number;
  body: Record<string, unknown>;
};

function getSyncHeaders(): Record<string, string> {
  const userId = getGoogleUserId();
  const token = getTokenLoginToken();
  const headers: Record<string, string> = { 'X-Google-User-Id': userId ?? 'guest' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function getStoredBaseVersion(): number {
  try {
    if (typeof localStorage === 'undefined') return 0;
    const raw = localStorage.getItem(SYNC_LAST_UPLOADED_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { version?: number; updated_at?: string };
    const v = parsed?.version;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    return 0;
  } catch {
    return 0;
  }
}

function setStoredBaseVersion(version: number, updatedAt: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(SYNC_LAST_UPLOADED_KEY, JSON.stringify({ version, updated_at: updatedAt }));
  } catch {
    /* ignore quota */
  }
}

/** อัปเดต meta หลังรับ patch จาก SSE (ให้ base_version ตรงกับ server) */
export function setStoredSyncMeta(version: number, updatedAt: string): void {
  setStoredBaseVersion(version, updatedAt);
}

async function fetchRemoteVersion(): Promise<{ version: number; updated_at: string } | null> {
  const res = await fetch(SYNC_VERSION_URL, { headers: getSyncHeaders() });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => ({}))) as { version?: number; updated_at?: string };
  if (typeof json.version !== 'number') return null;
  return { version: json.version, updated_at: json.updated_at ?? new Date().toISOString() };
}

export async function flushPendingSyncOps(input?: { bestEffort?: boolean }): Promise<{
  ok: boolean;
  flushed: number;
  remaining: number;
  conflict?: boolean;
}> {
  const bestEffort = !!input?.bestEffort;

  if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) {
    return { ok: false, flushed: 0, remaining: getPendingSyncOps().length };
  }

  let flushed = 0;
  const maxOpsPerRequest = 100;
  const maxConflictRetries = 1;

  // bestEffort (beforeunload) sends at most one request.
  const shouldLoop = !bestEffort;

  while (true) {
    const queue = getPendingSyncOps();
    if (queue.length === 0) return { ok: true, flushed, remaining: 0 };

    const batch = queue.slice(0, maxOpsPerRequest);
    let baseVersion = getStoredBaseVersion();

    let conflictRetries = 0;
    while (true) {
      const res = await fetch(SYNC_PATCH_URL, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getSyncHeaders() },
        body: JSON.stringify({ base_version: baseVersion, ops: batch }),
        keepalive: bestEffort,
      });

      if (res.status === 409) {
        conflictRetries++;
        if (conflictRetries > maxConflictRetries) {
          return {
            ok: false,
            flushed,
            remaining: queue.length,
            conflict: true,
          };
        }

        const remote = await fetchRemoteVersion();
        if (!remote) {
          return { ok: false, flushed, remaining: queue.length, conflict: true };
        }

        baseVersion = remote.version;
        setStoredBaseVersion(remote.version, remote.updated_at);
        // retry PATCH with updated baseVersion (step2 requirement)
        continue;
      }

      if (!res.ok) {
        return { ok: false, flushed, remaining: queue.length };
      }

      const data = (await res.json().catch(() => ({}))) as SyncPatchSuccess;
      if (!data || data.ok !== true || typeof data.version !== 'number') {
        return { ok: false, flushed, remaining: queue.length };
      }

      flushed += batch.length;
      consumePendingSyncOpsHead(batch.length);
      setStoredBaseVersion(data.version, new Date().toISOString());
      break;
    }

    if (!shouldLoop) break;
  }

  const remaining = getPendingSyncOps().length;
  return { ok: flushed > 0, flushed, remaining };
}

