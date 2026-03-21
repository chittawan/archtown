/**
 * Auto sync to Cloud using PATCH /api/sync/patch (field-level ops).
 * Triggered by 'archtown-data-saved' event (dispatched from archtownDb).
 */
import { flushPendingSyncOps } from './syncManager';

export const AUTO_SYNC_CLOUD_KEY = 'archtown_auto_sync_cloud';

const DEBOUNCE_MS = 3_000;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastFlushAt = 0;
const MIN_FLUSH_INTERVAL_MS = 1_000;
let listenersInitialized = false;
let flushInFlight = false;

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

function shouldRunAutoSync(): boolean {
  try {
    return getAutoSyncEnabled() && typeof navigator !== 'undefined' && navigator.onLine !== false;
  } catch {
    return false;
  }
}

function initListeners(): void {
  if (listenersInitialized) return;
  listenersInitialized = true;

  if (typeof window === 'undefined') return;

  window.addEventListener('online', () => {
    if (!shouldRunAutoSync()) return;
    void runSyncToCloud();
  });

  window.addEventListener('beforeunload', () => {
    if (!getAutoSyncEnabled()) return;
    // best-effort: keep queue in localStorage; even if fetch doesn't finish, we'll retry next time.
    void flushPendingSyncOps({ bestEffort: true });
  });
}

/**
 * Debounced auto-sync trigger.
 * Call this when data has been saved (e.g. in response to 'archtown-data-saved').
 */
export function scheduleSyncToCloud(): void {
  initListeners();
  if (!getAutoSyncEnabled()) return;

  const hadPendingTimer = !!debounceTimer;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    runSyncToCloud();
  }, DEBOUNCE_MS);

  // "save" should feel immediate: if we haven't scheduled a flush yet, kick one now.
  if (!hadPendingTimer) void runSyncToCloud();
}

async function runSyncToCloud(): Promise<void> {
  try {
    const now = Date.now();
    if (now - lastFlushAt < MIN_FLUSH_INTERVAL_MS) return;
    lastFlushAt = now;

    if (!shouldRunAutoSync()) return;

    if (flushInFlight) return;
    flushInFlight = true;

    window.dispatchEvent(new CustomEvent('cloud-sync-started'));
    try {
      const result = await flushPendingSyncOps();
      if (!result.ok && result.conflict) {
        window.dispatchEvent(
          new CustomEvent('cloud-sync-skipped-conflict', {
            detail: { message: 'Cloud มีข้อมูลใหม่กว่า ไม่ได้อัปเดตแบบ patch' },
          })
        );
      }
    } finally {
      window.dispatchEvent(new CustomEvent('cloud-sync-finished'));
      flushInFlight = false;
    }
  } catch {
    window.dispatchEvent(new CustomEvent('cloud-sync-finished'));
    flushInFlight = false;
  }
}
