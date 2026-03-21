/**
 * Queue of field-level sync ops for PATCH /api/sync/patch (offline-first).
 * In-memory + localStorage per Google user id (same idea as sync headers).
 */
import { getGoogleUserId } from '../lib/googleAuth';

const STORAGE_PREFIX = 'archtown_pending_sync_ops:';
/** Guardrail until flush batches to server (server max 100 per request). */
const MAX_OPS = 2000;

export type SyncPatchOp =
  | {
      op: 'update';
      table: string;
      id: string;
      fields: Record<string, unknown>;
      field_updated_at: Record<string, string>;
    }
  | { op: 'insert'; table: string; row: Record<string, unknown> }
  | { op: 'delete'; table: string; id: string };

let memoryQueue: SyncPatchOp[] = [];
let loadedStorageKey: string | null = null;

function storageKey(): string {
  const uid = getGoogleUserId() ?? 'guest';
  return `${STORAGE_PREFIX}${uid}`;
}

function ensureLoaded(): void {
  const key = storageKey();
  if (loadedStorageKey === key) return;
  loadedStorageKey = key;
  memoryQueue = [];
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) memoryQueue = parsed as SyncPatchOp[];
  } catch {
    memoryQueue = [];
  }
}

function persist(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(storageKey(), JSON.stringify(memoryQueue));
  } catch {
    /* quota / private mode */
  }
}

function trimIfNeeded(): void {
  if (memoryQueue.length <= MAX_OPS) return;
  memoryQueue.splice(0, memoryQueue.length - MAX_OPS);
}

export function enqueueSyncOp(op: SyncPatchOp): void {
  ensureLoaded();
  memoryQueue.push(op);
  trimIfNeeded();
  persist();
}

/** Append many ops then persist once (e.g. after a project save transaction). */
export function enqueueSyncOpsBatch(ops: SyncPatchOp[]): void {
  if (ops.length === 0) return;
  ensureLoaded();
  memoryQueue.push(...ops);
  trimIfNeeded();
  persist();
}

export function getPendingSyncOps(): SyncPatchOp[] {
  ensureLoaded();
  return [...memoryQueue];
}

export function getPendingSyncOpCount(): number {
  ensureLoaded();
  return memoryQueue.length;
}

export function clearPendingSyncOps(): void {
  ensureLoaded();
  memoryQueue = [];
  persist();
}

/** For PATCH flush (step 2): drop the first n ops after a successful apply. */
export function consumePendingSyncOpsHead(count: number): void {
  ensureLoaded();
  if (count <= 0) return;
  memoryQueue.splice(0, Math.min(count, memoryQueue.length));
  persist();
}

export function enqueuePatchUpdate(
  table: string,
  id: string,
  fields: Record<string, unknown>,
  at?: string
): void {
  const ts = at ?? new Date().toISOString();
  const field_updated_at: Record<string, string> = {};
  for (const k of Object.keys(fields)) {
    field_updated_at[k] = ts;
  }
  enqueueSyncOp({ op: 'update', table, id, fields, field_updated_at });
}

export function enqueuePatchInsert(table: string, row: Record<string, unknown>): void {
  enqueueSyncOp({ op: 'insert', table, row });
}

export function enqueuePatchDelete(table: string, id: string): void {
  enqueueSyncOp({ op: 'delete', table, id });
}
