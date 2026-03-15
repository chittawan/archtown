/**
 * ArchTown SQLite WASM — public API for frontend.
 * Delegates to repositories (layer แยกตาม table) และ client (connection).
 * หน้า frontend เรียก archtownDb.* หรือ import จาก repositories โดยตรง
 */
import * as client from './client';
import * as projectRepository from './repositories/project.repository';
import * as orgTeamRepository from './repositories/org_team.repository';
import * as capabilityRepository from './repositories/capability.repository';

// --- Projects (ผ่าน project.repository → table repos) ---
export const listProjects = projectRepository.listProjects;
export const getProject = projectRepository.getProject;
export const createProject = projectRepository.createProject;
export const saveProject = projectRepository.saveProject;

// --- Teams (ผ่าน org_team.repository) ---
export const listTeamIds = orgTeamRepository.listTeamIds;
export const getTeam = orgTeamRepository.getTeam;
export const saveTeam = orgTeamRepository.saveTeam;

// --- Capability (ผ่าน capability.repository) ---
export const getCapabilityLayout = capabilityRepository.getCapabilityLayout;
export const saveCapabilityLayout = capabilityRepository.saveCapabilityLayout;
export const getCapabilitySummary = capabilityRepository.getCapabilitySummary;

// --- DB status ---
export const isOpfsUsed = client.isOpfsUsed;

export async function getDbStatus(): Promise<{ opfsUsed: boolean; projectCount: number }> {
  try {
    const { projects } = await projectRepository.listProjects();
    return { opfsUsed: client.isOpfsUsed(), projectCount: projects?.length ?? 0 };
  } catch {
    return { opfsUsed: client.isOpfsUsed(), projectCount: 0 };
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
  await client.ensureDb();
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
