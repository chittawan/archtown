/**
 * Storage adapter: OPFS vs IndexedDB fallback.
 * - OPFS: used when opening DB with vfs=opfs (handled by SQLite WASM worker).
 * - IndexedDB: used to persist/restore DB when OPFS is not available.
 *   We store the sync payload (JSON) so we can restore via importAllTables without needing
 *   sqlite3_deserialize in the worker.
 */

const IDB_DB_KEY = 'Archtown/database/archtown.db';
const IDB_SYNC_PAYLOAD_KEY = 'Archtown/sync/payload';
const IDB_STORE = 'archtown';

export function getIndexedDBName(): string {
  return IDB_DB_KEY;
}

/** Check if OPFS (createSyncAccessHandle) is available. */
export async function supportsOPFS(): Promise<boolean> {
  try {
    if (typeof navigator?.storage?.getDirectory !== 'function') return false;
    const root = await navigator.storage.getDirectory();
    if (typeof (root as FileSystemDirectoryHandle & { createSyncAccessHandle?: unknown }).createSyncAccessHandle !== 'function')
      return false;
    return true;
  } catch {
    return false;
  }
}

/** Load persisted DB bytes from IndexedDB (for fallback when OPFS not used). */
export async function loadFromIndexedDB(): Promise<Uint8Array | null> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('archtown-idb', 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.close();
        return resolve(null);
      }
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const getReq = store.get(IDB_DB_KEY);
      getReq.onerror = () => reject(getReq.error);
      getReq.onsuccess = () => {
        db.close();
        const value = getReq.result;
        resolve(value != null && value instanceof Uint8Array ? value : null);
      };
    };
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
  });
}

/** Save DB bytes to IndexedDB (for fallback persistence). */
export async function saveToIndexedDB(bytes: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('archtown-idb', 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(bytes, IDB_DB_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
  });
}

/** Payload shape for sync/IndexedDB fallback (matches SyncExportPayload). */
export interface SyncPayloadForIdb {
  schema_version: number;
  version?: number;
  updated_at?: string;
  tables: Record<string, Record<string, unknown>[]>;
}

/** Load sync payload from IndexedDB (for fallback when OPFS not used). */
export async function loadSyncPayloadFromIndexedDB(): Promise<SyncPayloadForIdb | null> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('archtown-idb', 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.close();
        return resolve(null);
      }
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const getReq = store.get(IDB_SYNC_PAYLOAD_KEY);
      getReq.onerror = () => reject(getReq.error);
      getReq.onsuccess = () => {
        db.close();
        const value = getReq.result;
        if (value != null && typeof value === 'object' && 'schema_version' in value && 'tables' in value) {
          resolve(value as SyncPayloadForIdb);
        } else {
          resolve(null);
        }
      };
    };
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
  });
}

/** Save sync payload to IndexedDB (fallback persistence when OPFS not used). */
export async function saveSyncPayloadToIndexedDB(payload: SyncPayloadForIdb): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('archtown-idb', 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(payload, IDB_SYNC_PAYLOAD_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
  });
}
