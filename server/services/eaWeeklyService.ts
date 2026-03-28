import fs from 'fs';
import path from 'path';
import { getEaSnapshotsDir, getEaWeeksPath, getSyncBackupPath } from './paths';
import { getTableRows, parseBackupTables, projectExists, type BackupTables } from '../mcp/projectAggregates';
import { sanitizeId } from '../lib/idUtils';

export type WeekDefinition = {
  week_no: number;
  label: string;
  start: string;
  end: string;
};

export type WeeksFile = {
  project_id: string;
  /** เพิ่มทุกครั้งที่ PUT weeks (revision ของตารางสัปดาห์) */
  weeks_revision: number;
  updated_at?: string;
  weeks: WeekDefinition[];
};

export type SubtopicStatusItem = { subtopic_id: string; title: string };

export type TeamSnapshotBuckets = {
  RED: SubtopicStatusItem[];
  YELLOW: SubtopicStatusItem[];
  GREEN: SubtopicStatusItem[];
};

export type WeeklySnapshotFile = {
  ts: string;
  trigger: string;
  project_id: string;
  week_no: number;
  week_label: string;
  week_start: string;
  week_end: string;
  /** revision ของ weeks.json ณ เวลาถ่าย snapshot */
  weeks_revision?: number;
  teams: Record<string, TeamSnapshotBuckets>;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SNAPSHOT_NAME_RE = /^W(\d+)_(.+)\.json$/;

function normalizeProjectId(raw: string): string {
  return sanitizeId(raw);
}

function validateWeekDefinitions(weeks: unknown): { ok: true; weeks: WeekDefinition[] } | { ok: false; error: string } {
  if (!Array.isArray(weeks)) return { ok: false, error: 'weeks must be an array' };
  const seen = new Set<number>();
  const out: WeekDefinition[] = [];
  for (const w of weeks) {
    if (!w || typeof w !== 'object') return { ok: false, error: 'each week must be an object' };
    const o = w as Record<string, unknown>;
    const week_no = typeof o.week_no === 'number' ? o.week_no : Number(o.week_no);
    if (!Number.isInteger(week_no) || week_no < 1) return { ok: false, error: 'week_no must be a positive integer' };
    if (seen.has(week_no)) return { ok: false, error: `duplicate week_no: ${week_no}` };
    seen.add(week_no);
    const label = typeof o.label === 'string' ? o.label.trim() : '';
    if (!label) return { ok: false, error: 'each week needs a non-empty label' };
    const start = typeof o.start === 'string' ? o.start : '';
    const end = typeof o.end === 'string' ? o.end : '';
    if (!DATE_RE.test(start) || !DATE_RE.test(end)) return { ok: false, error: 'start and end must be YYYY-MM-DD' };
    out.push({ week_no, label, start, end });
  }
  out.sort((a, b) => a.week_no - b.week_no);
  return { ok: true, weeks: out };
}

function readBackupTables(userId: string): { ok: true; tables: BackupTables } | { ok: false; status: number; error: string } {
  const p = getSyncBackupPath(userId);
  if (!fs.existsSync(p)) {
    return { ok: false, status: 404, error: 'no cloud backup for user' };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return { ok: false, status: 500, error: 'backup.json parse error' };
  }
  const parsed = parseBackupTables(raw);
  if (!parsed) return { ok: false, status: 500, error: 'invalid backup shape' };
  return { ok: true, tables: parsed.tables };
}

function buildTopicToTeamName(tables: BackupTables): Map<string, { teamName: string; projectId: string }> {
  const topics = getTableRows(tables, 'project_topics');
  const teams = getTableRows(tables, 'project_teams');
  const map = new Map<string, { teamName: string; projectId: string }>();
  for (const t of topics) {
    const topicId = String(t.id ?? '');
    const teamId = String(t.team_id ?? '');
    const team = teams.find((x) => String(x.id) === teamId);
    if (!team) continue;
    map.set(topicId, {
      teamName: String(team.name ?? 'Team'),
      projectId: String(team.project_id ?? ''),
    });
  }
  return map;
}

function computeTeamsSnapshot(tables: BackupTables, projectId: string): Record<string, TeamSnapshotBuckets> {
  const subTopics = getTableRows(tables, 'project_sub_topics');
  const topicToTeam = buildTopicToTeamName(tables);
  const teamsOut: Record<string, TeamSnapshotBuckets> = {};

  const emptyBucket = (): TeamSnapshotBuckets => ({ RED: [], YELLOW: [], GREEN: [] });

  for (const st of subTopics) {
    const topicId = String(st.topic_id ?? '');
    const meta = topicToTeam.get(topicId);
    if (!meta || meta.projectId !== projectId) continue;

    const raw = st.status;
    const status = raw === 'RED' || raw === 'YELLOW' ? raw : 'GREEN';
    const teamName = meta.teamName;
    if (!teamsOut[teamName]) teamsOut[teamName] = emptyBucket();
    const id = String(st.id ?? '');
    const title = String(st.title ?? '');
    teamsOut[teamName][status].push({ subtopic_id: id, title });
  }

  return teamsOut;
}

function isoFilenamePart(ts: string): string {
  return ts.replace(/:/g, '-');
}

function weeksRevisionFromRaw(raw: Record<string, unknown>): number {
  const r = raw.weeks_revision;
  if (typeof r === 'number' && Number.isInteger(r) && r >= 0) return r;
  return 0;
}

export function getWeeks(userId: string, projectIdRaw: string): { ok: true; data: WeeksFile } | { ok: false; status: number; error: string } {
  const projectId = normalizeProjectId(projectIdRaw);
  if (!projectId) return { ok: false, status: 400, error: 'invalid projectId' };
  const file = getEaWeeksPath(userId, projectId);
  if (!fs.existsSync(file)) {
    return { ok: true, data: { project_id: projectId, weeks_revision: 0, weeks: [] } };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>;
    const weeks = Array.isArray(raw.weeks) ? raw.weeks : [];
    const v = validateWeekDefinitions(weeks);
    if (v.ok === false) return { ok: false, status: 500, error: `corrupt weeks.json: ${v.error}` };
    const weeks_revision = weeksRevisionFromRaw(raw);
    const updated_at = typeof raw.updated_at === 'string' ? raw.updated_at : undefined;
    return { ok: true, data: { project_id: projectId, weeks_revision, updated_at, weeks: v.weeks } };
  } catch {
    return { ok: false, status: 500, error: 'failed to read weeks.json' };
  }
}

export function saveWeeks(
  userId: string,
  projectIdRaw: string,
  body: unknown,
): { ok: true; data: WeeksFile } | { ok: false; status: number; error: string } {
  const projectId = normalizeProjectId(projectIdRaw);
  if (!projectId) return { ok: false, status: 400, error: 'invalid projectId' };
  if (!body || typeof body !== 'object') return { ok: false, status: 400, error: 'expected JSON object' };
  const weeksIn = (body as Record<string, unknown>).weeks;
  const v = validateWeekDefinitions(weeksIn);
  if (v.ok === false) return { ok: false, status: 400, error: v.error };

  const backup = readBackupTables(userId);
  if (backup.ok === false) return { ok: false, status: backup.status, error: backup.error };
  if (!projectExists(backup.tables, projectId)) {
    return { ok: false, status: 404, error: 'project not found in backup' };
  }

  const file = getEaWeeksPath(userId, projectId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let nextRevision = 1;
  if (fs.existsSync(file)) {
    try {
      const prev = JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>;
      nextRevision = weeksRevisionFromRaw(prev) + 1;
    } catch {
      nextRevision = 1;
    }
  }
  const updated_at = new Date().toISOString();
  const data: WeeksFile = { project_id: projectId, weeks_revision: nextRevision, updated_at, weeks: v.weeks };
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
  return { ok: true, data };
}

export function takeWeeklySnapshot(
  userId: string,
  projectIdRaw: string,
  weekNoRaw: unknown,
): { ok: true; data: WeeklySnapshotFile; file: string } | { ok: false; status: number; error: string } {
  const projectId = normalizeProjectId(projectIdRaw);
  if (!projectId) return { ok: false, status: 400, error: 'invalid projectId' };
  const week_no = typeof weekNoRaw === 'number' ? weekNoRaw : Number(weekNoRaw);
  if (!Number.isInteger(week_no) || week_no < 1) return { ok: false, status: 400, error: 'week_no must be a positive integer' };

  const backup = readBackupTables(userId);
  if (backup.ok === false) return { ok: false, status: backup.status, error: backup.error };
  if (!projectExists(backup.tables, projectId)) {
    return { ok: false, status: 404, error: 'project not found in backup' };
  }

  const weeksState = getWeeks(userId, projectId);
  if (weeksState.ok === false) return { ok: false, status: weeksState.status, error: weeksState.error };
  const weekDef = weeksState.data.weeks.find((w) => w.week_no === week_no);
  if (!weekDef) {
    return { ok: false, status: 400, error: `week_no ${week_no} is not defined; use PUT .../weeks first` };
  }

  const teams = computeTeamsSnapshot(backup.tables, projectId);
  const ts = new Date().toISOString();
  const weeks_revision =
    typeof weeksState.data.weeks_revision === 'number' ? weeksState.data.weeks_revision : 0;
  const snap: WeeklySnapshotFile = {
    ts,
    trigger: 'end-of-week',
    project_id: projectId,
    week_no,
    week_label: weekDef.label,
    week_start: weekDef.start,
    week_end: weekDef.end,
    weeks_revision,
    teams,
  };

  const dir = getEaSnapshotsDir(userId, projectId);
  fs.mkdirSync(dir, { recursive: true });
  const fname = `W${week_no}_${isoFilenamePart(ts)}.json`;
  const fpath = path.join(dir, fname);
  fs.writeFileSync(fpath, `${JSON.stringify(snap, null, 2)}\n`, 'utf-8');
  return { ok: true, data: snap, file: fpath };
}

function listSnapshotPaths(userId: string, projectId: string): string[] {
  const dir = getEaSnapshotsDir(userId, projectId);
  if (!fs.existsSync(dir)) return [];
  const names = fs.readdirSync(dir).filter((n) => SNAPSHOT_NAME_RE.test(n));
  return names.map((n) => path.join(dir, n));
}

function parseSnapshotFile(fpath: string): WeeklySnapshotFile | null {
  try {
    const raw = JSON.parse(fs.readFileSync(fpath, 'utf-8')) as WeeklySnapshotFile;
    if (!raw || typeof raw !== 'object') return null;
    if (typeof raw.week_no !== 'number') return null;
    return raw;
  } catch {
    return null;
  }
}

/** คง snapshot ล่าสุดต่อ week_no (เปรียบเทียบ ts) — ใช้แสดงกราฟ / รายการย่อ */
export function latestSnapshotPerWeek(snapshots: WeeklySnapshotFile[]): WeeklySnapshotFile[] {
  const byWeek = new Map<number, WeeklySnapshotFile>();
  for (const s of snapshots) {
    const cur = byWeek.get(s.week_no);
    if (!cur || String(s.ts) > String(cur.ts)) byWeek.set(s.week_no, s);
  }
  return [...byWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, snap]) => snap);
}

export function getHistory(
  userId: string,
  projectIdRaw: string,
  options?: { allSnapshots?: boolean },
):
  | {
      ok: true;
      /** รายการสำหรับแสดงผล: ค่าเริ่มต้น = latest ต่อ week_no; allSnapshots= true = ทุกไฟล์ */
      snapshots: WeeklySnapshotFile[];
      total_files: number;
      /** ทุก snapshot เรียง week_no แล้ว ts — ใช้หา "ล่าสุด" ทั้งระบบ */
      snapshots_all: WeeklySnapshotFile[];
    }
  | { ok: false; status: number; error: string } {
  const projectId = normalizeProjectId(projectIdRaw);
  if (!projectId) return { ok: false, status: 400, error: 'invalid projectId' };

  const paths = listSnapshotPaths(userId, projectId);
  const snapshots_all: WeeklySnapshotFile[] = [];
  for (const p of paths) {
    const s = parseSnapshotFile(p);
    if (s) snapshots_all.push(s);
  }
  snapshots_all.sort((a, b) => {
    if (a.week_no !== b.week_no) return a.week_no - b.week_no;
    return String(a.ts).localeCompare(String(b.ts));
  });
  const total_files = snapshots_all.length;
  const deduped = latestSnapshotPerWeek(snapshots_all);
  const snapshots = options?.allSnapshots ? snapshots_all : deduped;
  return { ok: true, snapshots, total_files, snapshots_all };
}

export type SubtopicTotals = { RED: number; YELLOW: number; GREEN: number };

export function snapshotSubtopicTotals(snap: WeeklySnapshotFile): SubtopicTotals {
  let RED = 0;
  let YELLOW = 0;
  let GREEN = 0;
  for (const t of Object.values(snap.teams)) {
    RED += t.RED.length;
    YELLOW += t.YELLOW.length;
    GREEN += t.GREEN.length;
  }
  return { RED, YELLOW, GREEN };
}

export function snapshotByTeamCounts(snap: WeeklySnapshotFile): Record<string, SubtopicTotals> {
  const out: Record<string, SubtopicTotals> = {};
  for (const [name, buckets] of Object.entries(snap.teams)) {
    out[name] = {
      RED: buckets.RED.length,
      YELLOW: buckets.YELLOW.length,
      GREEN: buckets.GREEN.length,
    };
  }
  return out;
}

function pickLatestSnapshotByTs(snapshots: WeeklySnapshotFile[]): WeeklySnapshotFile | undefined {
  if (!snapshots.length) return undefined;
  return snapshots.reduce((best, s) => (String(s.ts) > String(best.ts) ? s : best));
}

export type EaOverviewProjectRow = {
  project_id: string;
  project_name: string;
  weeks_defined: number;
  snapshots_count: number;
  latest?: {
    ts: string;
    week_no: number;
    week_label: string;
    subtopic_totals: SubtopicTotals;
  };
};

export function getEaOverview(
  userId: string,
): { ok: true; projects: EaOverviewProjectRow[] } | { ok: false; status: number; error: string } {
  const backup = readBackupTables(userId);
  if (backup.ok === false) return { ok: false, status: backup.status, error: backup.error };
  const rows = getTableRows(backup.tables, 'projects');
  const projects: EaOverviewProjectRow[] = [];
  for (const pr of rows) {
    const project_id = String(pr.id ?? '');
    if (!project_id) continue;
    const project_name = String(pr.name ?? project_id);
    const wk = getWeeks(userId, project_id);
    const weeks_defined = wk.ok ? wk.data.weeks.length : 0;
    const hist = getHistory(userId, project_id);
    const snapshots_count = hist.ok ? hist.total_files : 0;
    const latestSnap = hist.ok ? pickLatestSnapshotByTs(hist.snapshots_all) : undefined;
    const latest = latestSnap
      ? {
          ts: latestSnap.ts,
          week_no: latestSnap.week_no,
          week_label: latestSnap.week_label,
          subtopic_totals: snapshotSubtopicTotals(latestSnap),
        }
      : undefined;
    projects.push({ project_id, project_name, weeks_defined, snapshots_count, latest });
  }
  projects.sort((a, b) => a.project_name.localeCompare(b.project_name));
  return { ok: true, projects };
}

export type EaProjectSummary = {
  project_id: string;
  project_name: string;
  weeks_revision: number;
  weeks_updated_at?: string;
  weeks: WeekDefinition[];
  /** จำนวนไฟล์ snapshot ทั้งหมดบนดิสก์ */
  snapshots_count: number;
  /** จำนวน week ที่มี snapshot (แสดงผลแบบ latest ต่อ week) */
  snapshots_weeks_display: number;
  latest?: {
    ts: string;
    week_no: number;
    week_label: string;
    week_start: string;
    week_end: string;
    subtopic_totals: SubtopicTotals;
    by_team: Record<string, SubtopicTotals>;
  };
};

export function getProjectEaSummary(
  userId: string,
  projectIdRaw: string,
): { ok: true; data: EaProjectSummary } | { ok: false; status: number; error: string } {
  const projectId = normalizeProjectId(projectIdRaw);
  if (!projectId) return { ok: false, status: 400, error: 'invalid projectId' };
  const backup = readBackupTables(userId);
  if (backup.ok === false) return { ok: false, status: backup.status, error: backup.error };
  if (!projectExists(backup.tables, projectId)) {
    return { ok: false, status: 404, error: 'project not found in backup' };
  }
  const projRow = getTableRows(backup.tables, 'projects').find((p) => String(p.id ?? '') === projectId);
  const project_name = String(projRow?.name ?? projectId);
  const wk = getWeeks(userId, projectId);
  const weeks = wk.ok ? wk.data.weeks : [];
  const weeks_revision = wk.ok ? wk.data.weeks_revision : 0;
  const weeks_updated_at = wk.ok ? wk.data.updated_at : undefined;
  const hist = getHistory(userId, projectId);
  const snapshots_count = hist.ok ? hist.total_files : 0;
  const snapshots_weeks_display = hist.ok ? hist.snapshots.length : 0;
  const latestSnap = hist.ok ? pickLatestSnapshotByTs(hist.snapshots_all) : undefined;
  const latest = latestSnap
    ? {
        ts: latestSnap.ts,
        week_no: latestSnap.week_no,
        week_label: latestSnap.week_label,
        week_start: latestSnap.week_start,
        week_end: latestSnap.week_end,
        subtopic_totals: snapshotSubtopicTotals(latestSnap),
        by_team: snapshotByTeamCounts(latestSnap),
      }
    : undefined;
  return {
    ok: true,
    data: {
      project_id: projectId,
      project_name,
      weeks_revision,
      weeks_updated_at,
      weeks,
      snapshots_count,
      snapshots_weeks_display,
      latest,
    },
  };
}

export function getWeekSnapshot(
  userId: string,
  projectIdRaw: string,
  weekNoRaw: unknown,
): { ok: true; snapshot: WeeklySnapshotFile | null } | { ok: false; status: number; error: string } {
  const projectId = normalizeProjectId(projectIdRaw);
  if (!projectId) return { ok: false, status: 400, error: 'invalid projectId' };
  const week_no = typeof weekNoRaw === 'number' ? weekNoRaw : Number(weekNoRaw);
  if (!Number.isInteger(week_no) || week_no < 1) return { ok: false, status: 400, error: 'invalid week_no' };

  const paths = listSnapshotPaths(userId, projectId).filter((p) => {
    const base = path.basename(p);
    const m = base.match(SNAPSHOT_NAME_RE);
    return m && Number(m[1]) === week_no;
  });
  if (paths.length === 0) return { ok: true, snapshot: null };

  let best: { mtime: number; snap: WeeklySnapshotFile } | null = null;
  for (const p of paths) {
    const snap = parseSnapshotFile(p);
    if (!snap) continue;
    const st = fs.statSync(p);
    const mtime = st.mtimeMs;
    if (!best || mtime >= best.mtime) best = { mtime, snap };
  }
  return { ok: true, snapshot: best?.snap ?? null };
}
