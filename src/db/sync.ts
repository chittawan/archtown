/**
 * Cloud Sync API: export/import full DB for backup or future cloud sync.
 * Format: JSON (UTF-8). Use exportForSync() to download; importFromSync() to restore.
 */
import { exportAllTables, importAllTables } from './archtownDb';
import { clearPendingSyncOps } from './pendingSyncOps';

/**
 * Serialize the database to a portable format for backup or cloud upload.
 * Returns a Blob (application/json) and the same data as ArrayBuffer for callers that need it.
 */
export async function exportForSync(): Promise<Blob> {
  const payload = await exportAllTables();
  const json = JSON.stringify(payload);
  return new Blob([json], { type: 'application/json' });
}

/**
 * Same as exportForSync but returns ArrayBuffer (e.g. for IndexedDB or binary APIs).
 */
export async function exportForSyncAsArrayBuffer(): Promise<ArrayBuffer> {
  const payload = await exportAllTables();
  const json = JSON.stringify(payload);
  return new TextEncoder().encode(json).buffer;
}

/**
 * Restore database from a previously exported payload.
 * Replaces current data (no merge). Use for cloud restore or "Load backup".
 */
export async function importFromSync(bytes: ArrayBuffer): Promise<void> {
  const json = new TextDecoder().decode(bytes);
  const payload = JSON.parse(json) as Parameters<typeof importAllTables>[0];
  await importAllTables(payload);
  clearPendingSyncOps();
}
