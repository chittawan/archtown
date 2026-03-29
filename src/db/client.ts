/**
 * Low-level SQLite WASM client.
 * Exposes exec, execRun, and transaction helpers for use by repositories.
 */
import * as sqliteWasm from '@sqlite.org/sqlite-wasm';
import { ARCHTOWN_SCHEMA } from './schema';

type Worker1Promiser = (type: string, args?: unknown) => Promise<{ result: unknown }>;
type Worker1PromiserFactory = (config?: { worker?: () => Worker }) => Promise<Worker1Promiser>;
const sqlite3Worker1Promiser = (sqliteWasm as unknown as { sqlite3Worker1Promiser: Worker1PromiserFactory }).sqlite3Worker1Promiser;

const DB_FILENAME_OPFS = 'file:Archtown/database/archtown.db?vfs=opfs';
const DB_FILENAME_MEMORY = 'file:archtown-mem.db';

let promiser: Worker1Promiser | null = null;
let dbId: string | null = null;
let usedOpfs = false;
/** กันหลาย caller เรียก ensureDb พร้อมกันก่อน init เสร็จ — ไม่งั้นสร้าง Worker ซ้ำและทับ dbId ทำให้ค้างที่ขั้นเปิด DB */
let ensureDbPromise: Promise<{ promiser: Worker1Promiser; dbId: string }> | null = null;

function getWorkerUrl(): string {
  const origin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : typeof document !== 'undefined' && document.baseURI
      ? new URL(document.baseURI).origin
      : '';
  const sqliteDir = `${origin}/sqlite`;
  const params = new URLSearchParams({ 'sqlite3.dir': sqliteDir });
  return `${sqliteDir}/sqlite3-worker1.mjs?${params.toString()}`;
}

export async function ensureDb(): Promise<{ promiser: Worker1Promiser; dbId: string }> {
  if (promiser && dbId) return { promiser, dbId };
  if (!ensureDbPromise) {
    ensureDbPromise = openArchtownSqlite().finally(() => {
      ensureDbPromise = null;
    });
  }
  return ensureDbPromise;
}

async function openArchtownSqlite(): Promise<{ promiser: Worker1Promiser; dbId: string }> {
  const workerUrl = getWorkerUrl();
  const p = await sqlite3Worker1Promiser({
    worker: () => new Worker(workerUrl, { type: 'module' }),
  });

  try {
    const config = await p('config-get', {});
    const vfsList: string[] = (config as { result: { vfsList?: string[] } }).result?.vfsList ?? [];
    const useOpfs = vfsList.includes('opfs');

    let openRes: { result: { dbId: string } };
    try {
      openRes = (await p('open', {
        filename: useOpfs ? DB_FILENAME_OPFS : DB_FILENAME_MEMORY,
      })) as { result: { dbId: string } };
    } catch {
      openRes = (await p('open', { filename: DB_FILENAME_MEMORY })) as { result: { dbId: string } };
    }
    const id = openRes.result.dbId;
    usedOpfs = useOpfs;

    await p('exec', { dbId: id, sql: ARCHTOWN_SCHEMA });
    await ensureProjectSubTopicDetailsHealthColumns(p, id);

    promiser = p;
    dbId = id;
    return { promiser: p, dbId: id };
  } catch (e) {
    promiser = null;
    dbId = null;
    throw e;
  }
}

function pragmaRowNames(rows: unknown): Set<string> {
  const names = new Set<string>();
  if (!Array.isArray(rows)) return names;
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const raw = o.name ?? o.NAME;
    if (typeof raw === 'string' && raw) names.add(raw);
  }
  return names;
}

function execErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'result' in err) {
    const res = (err as { result?: { message?: string } }).result;
    if (res && typeof res.message === 'string') return res.message;
  }
  return String(err);
}

function isDuplicateColumnError(err: unknown): boolean {
  return /duplicate column/i.test(execErrorMessage(err));
}

/** Idempotent migrations for DBs created before Phase9 task-health columns. */
async function ensureProjectSubTopicDetailsHealthColumns(p: Worker1Promiser, dbId: string): Promise<void> {
  const resultRows: Record<string, unknown>[] = [];
  const pragmaRes = await p('exec', {
    dbId,
    sql: 'PRAGMA table_info(project_sub_topic_details)',
    returnValue: 'resultRows',
    resultRows,
    rowMode: 'object',
  });
  const outRows =
    (pragmaRes as { result?: { resultRows?: unknown[] } })?.result?.resultRows ?? resultRows;
  const names = pragmaRowNames(outRows);

  const add = async (col: string, ddl: string) => {
    if (names.has(col)) return;
    try {
      await p('exec', { dbId, sql: ddl });
      names.add(col);
    } catch (e) {
      if (isDuplicateColumnError(e)) {
        names.add(col);
        return;
      }
      throw e;
    }
  };
  await add('health', 'ALTER TABLE project_sub_topic_details ADD COLUMN health TEXT');
  await add('health_note', 'ALTER TABLE project_sub_topic_details ADD COLUMN health_note TEXT');
  await add('health_reviewed_at', 'ALTER TABLE project_sub_topic_details ADD COLUMN health_reviewed_at TEXT');
  await add('health_updated_at', 'ALTER TABLE project_sub_topic_details ADD COLUMN health_updated_at TEXT');
  await add(
    'health_note_updated_at',
    'ALTER TABLE project_sub_topic_details ADD COLUMN health_note_updated_at TEXT',
  );
  await add(
    'health_reviewed_at_updated_at',
    'ALTER TABLE project_sub_topic_details ADD COLUMN health_reviewed_at_updated_at TEXT',
  );
}

export async function exec<T = unknown>(
  sql: string,
  bind?: Record<string, unknown> | unknown[]
): Promise<{ resultRows?: T[] }> {
  const { promiser: p, dbId: id } = await ensureDb();
  const resultRows: T[] = [];
  const res = await p('exec', {
    dbId: id,
    sql,
    bind: bind ?? undefined,
    returnValue: 'resultRows',
    resultRows,
    rowMode: 'object',
  });
  const out = (res as { result?: { resultRows?: T[] } }).result;
  return { resultRows: (out?.resultRows?.length ? out.resultRows : resultRows) as T[] };
}

export async function execRun(sql: string, bind?: Record<string, unknown> | unknown[]): Promise<void> {
  const { promiser: p, dbId: id } = await ensureDb();
  await p('exec', { dbId: id, sql, bind: bind ?? undefined });
}

export async function runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
  const { promiser: p, dbId: db } = await ensureDb();
  await p('exec', { dbId: db, sql: 'BEGIN TRANSACTION' });
  try {
    const result = await fn();
    await p('exec', { dbId: db, sql: 'COMMIT' });
    return result;
  } catch (e) {
    await p('exec', { dbId: db, sql: 'ROLLBACK' });
    throw e;
  }
}

export function isOpfsUsed(): boolean {
  return usedOpfs;
}
