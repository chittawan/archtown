/**
 * Auto sync to Cloud when using OPFS: debounced upload after save.
 * Triggered by 'archtown-data-saved' event (dispatched from archtownDb).
 * Does not call uploadToCloud with force; on 409 skips and dispatches event for UI.
 */
import * as client from './client';
import { uploadToCloud, isSyncAvailable } from './cloudSync';

export const AUTO_SYNC_CLOUD_KEY = 'archtown_auto_sync_cloud';

const DEBOUNCE_MS = 45_000;
const MIN_SYNC_INTERVAL_MS = 90_000;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastSyncAt = 0;

export function getAutoSyncEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(AUTO_SYNC_CLOUD_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setAutoSyncEnabled(enabled: boolean): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(AUTO_SYNC_CLOUD_KEY, String(enabled));
    }
  } catch {
    /* ignore */
  }
}

/**
 * Schedule an upload to Cloud after a short debounce. Only runs when using OPFS and auto-sync is on.
 * Call this when data has been saved (e.g. in response to 'archtown-data-saved').
 */
export function scheduleSyncToCloud(): void {
  if (!client.isOpfsUsed()) return;
  if (!getAutoSyncEnabled()) return;

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    runSyncToCloud();
  }, DEBOUNCE_MS);
}

async function runSyncToCloud(): Promise<void> {
  try {
    const available = await isSyncAvailable();
    if (!available) return;

    const now = Date.now();
    if (lastSyncAt > 0 && now - lastSyncAt < MIN_SYNC_INTERVAL_MS) return;

    const result = await uploadToCloud(false);
    if (result.ok) {
      lastSyncAt = now;
    } else if (!result.ok && 'conflict' in result && result.conflict) {
      window.dispatchEvent(
        new CustomEvent('cloud-sync-skipped-conflict', {
          detail: { message: 'Cloud มีข้อมูลใหม่กว่า ไม่ได้อัปโหลด' },
        })
      );
    }
  } catch {
    /* ignore */
  }
}
