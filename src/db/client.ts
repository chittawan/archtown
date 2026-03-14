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

  const workerUrl = getWorkerUrl();
  promiser = await sqlite3Worker1Promiser({
    worker: () => new Worker(workerUrl, { type: 'module' }),
  });

  const config = await promiser('config-get', {});
  const vfsList: string[] = (config as { result: { vfsList?: string[] } }).result?.vfsList ?? [];
  const useOpfs = vfsList.includes('opfs');

  let openRes: { result: { dbId: string } };
  try {
    openRes = (await promiser('open', {
      filename: useOpfs ? DB_FILENAME_OPFS : DB_FILENAME_MEMORY,
    })) as { result: { dbId: string } };
  } catch {
    openRes = (await promiser('open', { filename: DB_FILENAME_MEMORY })) as { result: { dbId: string } };
  }
  dbId = openRes.result.dbId;
  usedOpfs = useOpfs;

  await promiser('exec', { dbId, sql: ARCHTOWN_SCHEMA });
  return { promiser, dbId };
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
