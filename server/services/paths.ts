import path from 'path';

export const DATA_ROOT = path.join(process.cwd(), 'data');
export const SYNC_DIR = path.join(DATA_ROOT, 'sync');
export const EA_DIR = path.join(DATA_ROOT, 'ea');
export const AUDIT_DIR = path.join(DATA_ROOT, 'audit');
export const AUTH_DIR = path.join(DATA_ROOT, 'auth');
export const TOKENS_FILE = path.join(AUTH_DIR, 'tokens.json');

export function getSyncBackupPath(userId: string): string {
  return path.join(SYNC_DIR, userId, 'backup.json');
}

/** EA weekly timeline: weeks.json + snapshots/ under project id */
export function getEaProjectRoot(userId: string, projectId: string): string {
  return path.join(EA_DIR, userId, projectId);
}

export function getEaWeeksPath(userId: string, projectId: string): string {
  return path.join(getEaProjectRoot(userId, projectId), 'weeks.json');
}

export function getEaSnapshotsDir(userId: string, projectId: string): string {
  return path.join(getEaProjectRoot(userId, projectId), 'snapshots');
}
