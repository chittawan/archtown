/**
 * ArchTown SQLite WASM — public API for frontend.
 * Delegates to repositories (layer แยกตาม table) และ client (connection).
 * เมื่อไม่ใช้ OPFS จะ fallback เก็บใน IndexedDB (sync payload) เพื่อให้รีเฟรชแล้วข้อมูลไม่หาย
 */
import * as client from './client';
import { loadSyncPayloadFromIndexedDB, saveSyncPayloadToIndexedDB } from './storage';
import * as projectRepository from './repositories/project.repository';
import * as orgTeamRepository from './repositories/org_team.repository';
import * as capabilityRepository from './repositories/capability.repository';

let idbFallbackLoaded = false;
let persistIdbTimer: ReturnType<typeof setTimeout> | null = null;
const PERSIST_DEBOUNCE_MS = 1500;

/** เมื่อไม่ใช้ OPFS โหลดข้อมูลจาก IndexedDB (ครั้งเดียวต่อ session) */
async function ensureIdbFallbackInitialized(): Promise<void> {
  if (client.isOpfsUsed()) return;
  if (idbFallbackLoaded) return;
  await client.ensureDb();
  const payload = await loadSyncPayloadFromIndexedDB();
  if (payload?.tables && Object.keys(payload.tables).length > 0) {
    await importAllTables(payload as SyncExportPayload);
  }
  idbFallbackLoaded = true;
}

/** บันทึก snapshot ลง IndexedDB (debounced) เมื่อไม่ใช้ OPFS */
function schedulePersistIdbFallback(): void {
  if (client.isOpfsUsed()) return;
  if (persistIdbTimer) clearTimeout(persistIdbTimer);
  persistIdbTimer = setTimeout(async () => {
    persistIdbTimer = null;
    try {
      const payload = await exportAllTables();
      await saveSyncPayloadToIndexedDB(payload);
    } catch (_) {
      // ignore
    }
  }, PERSIST_DEBOUNCE_MS);
}

// --- Projects (ผ่าน project.repository → table repos) ---
export async function listProjects() {
  await ensureIdbFallbackInitialized();
  return projectRepository.listProjects();
}
export async function getProject(id: string) {
  await ensureIdbFallbackInitialized();
  return projectRepository.getProject(id);
}
export async function createProject(name: string) {
  await ensureIdbFallbackInitialized();
  const out = await projectRepository.createProject(name);
  if (out.ok) schedulePersistIdbFallback();
  return out;
}
export async function saveProject(projectName: string, data: Parameters<typeof projectRepository.saveProject>[1]) {
  await ensureIdbFallbackInitialized();
  const out = await projectRepository.saveProject(projectName, data);
  schedulePersistIdbFallback();
  return out;
}

// --- Teams (ผ่าน org_team.repository) ---
export async function listTeamIds() {
  await ensureIdbFallbackInitialized();
  return orgTeamRepository.listTeamIds();
}
export async function getTeam(id: string) {
  await ensureIdbFallbackInitialized();
  return orgTeamRepository.getTeam(id);
}
export async function saveTeam(id: string, data: Parameters<typeof orgTeamRepository.saveTeam>[1]) {
  await ensureIdbFallbackInitialized();
  const out = await orgTeamRepository.saveTeam(id, data);
  schedulePersistIdbFallback();
  return out;
}

// --- Capability (ผ่าน capability.repository) ---
export async function getCapabilityLayout() {
  await ensureIdbFallbackInitialized();
  return capabilityRepository.getCapabilityLayout();
}
export async function saveCapabilityLayout(layout: Parameters<typeof capabilityRepository.saveCapabilityLayout>[0]) {
  await ensureIdbFallbackInitialized();
  const out = await capabilityRepository.saveCapabilityLayout(layout);
  schedulePersistIdbFallback();
  return out;
}
export async function getCapabilitySummary(projectId?: string) {
  await ensureIdbFallbackInitialized();
  return capabilityRepository.getCapabilitySummary(projectId);
}

// --- DB status ---
export const isOpfsUsed = client.isOpfsUsed;

export async function getDbStatus(): Promise<{ opfsUsed: boolean; idbFallback: boolean; projectCount: number }> {
  await ensureIdbFallbackInitialized();
  try {
    const { projects } = await projectRepository.listProjects();
    return {
      opfsUsed: client.isOpfsUsed(),
      idbFallback: !client.isOpfsUsed(),
      projectCount: projects?.length ?? 0,
    };
  } catch {
    return {
      opfsUsed: client.isOpfsUsed(),
      idbFallback: !client.isOpfsUsed(),
      projectCount: 0,
    };
  }
}

// --- Sync export/import (raw table dump for Cloud Sync API) ---
const SYNC_TABLES_EXPORT_ORDER = [
  'projects',
  'project_teams',
  'project_topics',
  'project_sub_topics',
  'project_sub_topic_details',
  'org_teams',
  'org_team_children',
  'capability_order',
  'caps',
  'cap_projects',
] as const;

export const SYNC_SCHEMA_VERSION = 1;

/** localStorage key for last successful upload (version + updated_at) */
export const SYNC_LAST_UPLOADED_KEY = 'archtown_sync_last_uploaded';

export interface SyncExportPayload {
  schema_version: number;
  /** Monotonic version for conflict detection (optional for backward compatibility with old backups). */
  version?: number;
  /** ISO 8601 export time (optional for backward compatibility). */
  updated_at?: string;
  tables: Record<string, Record<string, unknown>[]>;
}

function getNextSyncVersion(): { version: number; updated_at: string } {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SYNC_LAST_UPLOADED_KEY) : null;
    const last = raw ? (JSON.parse(raw) as { version?: number; updated_at?: string }) : null;
    const nextVersion = (last?.version ?? 0) + 1;
    return { version: nextVersion, updated_at: new Date().toISOString() };
  } catch {
    return { version: 1, updated_at: new Date().toISOString() };
  }
}

export async function exportAllTables(): Promise<SyncExportPayload> {
  await ensureIdbFallbackInitialized();
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const table of SYNC_TABLES_EXPORT_ORDER) {
    const { resultRows } = await client.exec<Record<string, unknown>>(`SELECT * FROM ${table}`);
    tables[table] = (resultRows ?? []) as Record<string, unknown>[];
  }
  const { version, updated_at } = getNextSyncVersion();
  return { schema_version: SYNC_SCHEMA_VERSION, version, updated_at, tables };
}

export async function importAllTables(payload: SyncExportPayload): Promise<void> {
  const version = payload.schema_version ?? 0;
  if (version > SYNC_SCHEMA_VERSION) {
    throw new Error(`Unsupported sync schema version: ${version}`);
  }
  const tables = payload.tables ?? {};
  const deleteOrder = [...SYNC_TABLES_EXPORT_ORDER].reverse();
  await client.runInTransaction(async () => {
    for (const table of deleteOrder) {
      await client.execRun(`DELETE FROM ${table}`);
    }
    for (const table of SYNC_TABLES_EXPORT_ORDER) {
      const rows = tables[table];
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const cols = Object.keys(rows[0] ?? {});
      if (cols.length === 0) continue;
      const placeholders = cols.map(() => '?').join(', ');
      const colList = cols.join(', ');
      for (const row of rows) {
        const values = cols.map((c) => row[c] ?? null);
        await client.execRun(`INSERT INTO ${table} (${colList}) VALUES (${placeholders})`, values);
      }
    }
  });
}

/** Clear all sync tables (for logout / user switch). Uses empty payload so all rows are deleted. */
export async function clearAllTables(): Promise<void> {
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const table of SYNC_TABLES_EXPORT_ORDER) {
    tables[table] = [];
  }
  await importAllTables({
    schema_version: SYNC_SCHEMA_VERSION,
    tables,
  });
}
