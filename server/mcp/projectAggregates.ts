export type BackupTables = Record<string, unknown[]>;

export function getTableRows(tables: BackupTables | undefined, name: string): Record<string, unknown>[] {
  if (!tables || !Array.isArray(tables[name])) return [];
  return (tables[name] as unknown[]).filter((r): r is Record<string, unknown> => !!r && typeof r === 'object');
}

function rowById(rows: Record<string, unknown>[], id: string): Record<string, unknown> | undefined {
  return rows.find((r) => String(r.id ?? '') === id);
}

export type ProjectWithCounts = {
  id: string;
  name: string;
  subtopic_status_counts: { RED: number; YELLOW: number; GREEN: number };
};

export function aggregateProjects(tables: BackupTables): ProjectWithCounts[] {
  const projects = getTableRows(tables, 'projects');
  const subTopics = getTableRows(tables, 'project_sub_topics');
  const topics = getTableRows(tables, 'project_topics');
  const teams = getTableRows(tables, 'project_teams');

  const topicIdToProjectId = new Map<string, string>();
  for (const t of topics) {
    const teamId = String(t.team_id ?? '');
    const team = teams.find((x) => String(x.id) === teamId);
    if (team) {
      topicIdToProjectId.set(String(t.id), String(team.project_id ?? ''));
    }
  }

  const counts = new Map<string, { RED: number; YELLOW: number; GREEN: number }>();
  for (const p of projects) {
    counts.set(String(p.id), { RED: 0, YELLOW: 0, GREEN: 0 });
  }

  for (const st of subTopics) {
    const topicId = String(st.topic_id ?? '');
    const pid = topicIdToProjectId.get(topicId);
    if (!pid || !counts.has(pid)) continue;
    const raw = st.status;
    const status = raw === 'RED' || raw === 'YELLOW' ? raw : 'GREEN';
    const c = counts.get(pid)!;
    c[status] += 1;
  }

  return projects.map((p) => {
    const id = String(p.id);
    return {
      id,
      name: String(p.name ?? ''),
      subtopic_status_counts: counts.get(id) ?? { RED: 0, YELLOW: 0, GREEN: 0 },
    };
  });
}

export type TaskListItem = {
  id: string;
  sub_topic_id: string;
  text: string;
  description: string | null;
  status: string;
  due_date: string | null;
  sort_order: number;
  subtopic_title: string;
  project_id: string;
  project_name: string;
  health: string | null;
  health_note: string | null;
  health_reviewed_at: string | null;
};

function buildTopicToProjectMaps(tables: BackupTables): {
  topicIdToProjectId: Map<string, string>;
  projectNameById: Map<string, string>;
} {
  const topics = getTableRows(tables, 'project_topics');
  const teams = getTableRows(tables, 'project_teams');
  const projects = getTableRows(tables, 'projects');

  const topicIdToProjectId = new Map<string, string>();
  for (const t of topics) {
    const teamId = String(t.team_id ?? '');
    const team = teams.find((x) => String(x.id) === teamId);
    if (team) {
      topicIdToProjectId.set(String(t.id), String(team.project_id ?? ''));
    }
  }

  const projectNameById = new Map<string, string>();
  for (const p of projects) {
    projectNameById.set(String(p.id), String(p.name ?? ''));
  }

  return { topicIdToProjectId, projectNameById };
}

export function listTasksFiltered(
  tables: BackupTables,
  filters: { status: 'todo' | 'doing' | 'done' | 'all'; project_id?: string; overdue_only: boolean },
): TaskListItem[] {
  const details = getTableRows(tables, 'project_sub_topic_details');
  const subTopics = getTableRows(tables, 'project_sub_topics');
  const { topicIdToProjectId, projectNameById } = buildTopicToProjectMaps(tables);

  const today = new Date().toISOString().slice(0, 10);
  const out: TaskListItem[] = [];

  for (const d of details) {
    const id = String(d.id ?? '');
    const subTopicId = String(d.sub_topic_id ?? '');
    const sub = rowById(subTopics, subTopicId);
    if (!sub) continue;

    const topicId = String(sub.topic_id ?? '');
    const projectId = topicIdToProjectId.get(topicId) ?? '';
    if (filters.project_id && projectId !== filters.project_id) continue;

    const status = String(d.status ?? 'todo');
    if (filters.status !== 'all' && status !== filters.status) continue;

    if (filters.overdue_only) {
      if (status === 'done') continue;
      const dd = d.due_date;
      if (typeof dd !== 'string' || !dd || dd >= today) continue;
    }

    const rawH = d.health;
    const health =
      rawH === 'RED' || rawH === 'YELLOW' || rawH === 'GREEN' ? rawH : null;
    out.push({
      id,
      sub_topic_id: subTopicId,
      text: String(d.text ?? ''),
      description: d.description == null ? null : String(d.description),
      status,
      due_date: typeof d.due_date === 'string' && d.due_date ? d.due_date : null,
      sort_order: typeof d.sort_order === 'number' ? d.sort_order : Number(d.sort_order) || 0,
      subtopic_title: String(sub.title ?? ''),
      project_id: projectId,
      project_name: projectNameById.get(projectId) ?? projectId,
      health,
      health_note: d.health_note == null || d.health_note === '' ? null : String(d.health_note),
      health_reviewed_at:
        d.health_reviewed_at == null || d.health_reviewed_at === ''
          ? null
          : String(d.health_reviewed_at),
    });
  }

  return out;
}

const HEALTH_REVIEW_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Tasks with no health set, or health_reviewed_at missing/stale (>7 days). Per Phase9 SA review queue. */
export function listTasksNeedingHealthReview(
  tables: BackupTables,
  filters: { project_id?: string },
): TaskListItem[] {
  const all = listTasksFiltered(tables, {
    status: 'all',
    project_id: filters.project_id,
    overdue_only: false,
  });
  const cutoff = Date.now() - HEALTH_REVIEW_MAX_AGE_MS;
  return all.filter((t) => {
    if (t.health == null) return true;
    const reviewed = t.health_reviewed_at;
    if (reviewed == null || reviewed === '') return true;
    const ts = Date.parse(reviewed);
    if (Number.isNaN(ts)) return true;
    return ts < cutoff;
  });
}

export function parseBackupTables(data: unknown): { version: number; tables: BackupTables } | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  const version = typeof o.version === 'number' ? o.version : Number(o.version ?? 0);
  const tables = o.tables;
  if (!tables || typeof tables !== 'object' || Array.isArray(tables)) return null;
  return { version, tables: tables as BackupTables };
}

export function maxSortOrderForSubTopic(tables: BackupTables, subTopicId: string): number {
  const details = getTableRows(tables, 'project_sub_topic_details');
  let max = -1;
  for (const d of details) {
    if (String(d.sub_topic_id ?? '') !== subTopicId) continue;
    const so = typeof d.sort_order === 'number' ? d.sort_order : Number(d.sort_order) || 0;
    if (so > max) max = so;
  }
  return max;
}

export function subTopicExists(tables: BackupTables, subTopicId: string): boolean {
  return !!rowById(getTableRows(tables, 'project_sub_topics'), subTopicId);
}

export function projectExists(tables: BackupTables, projectId: string): boolean {
  return !!rowById(getTableRows(tables, 'projects'), projectId);
}

export function topicExists(tables: BackupTables, topicId: string): boolean {
  return !!rowById(getTableRows(tables, 'project_topics'), topicId);
}

export function maxSortOrderForTopic(tables: BackupTables, topicId: string): number {
  const subTopics = getTableRows(tables, 'project_sub_topics');
  let max = -1;
  for (const s of subTopics) {
    if (String(s.topic_id ?? '') !== topicId) continue;
    const so = typeof s.sort_order === 'number' ? s.sort_order : Number(s.sort_order) || 0;
    if (so > max) max = so;
  }
  return max;
}

export function detailExists(tables: BackupTables, detailId: string): boolean {
  return !!rowById(getTableRows(tables, 'project_sub_topic_details'), detailId);
}

export function teamExists(tables: BackupTables, teamId: string): boolean {
  return !!rowById(getTableRows(tables, 'project_teams'), teamId);
}

export function maxSortOrderForProjectTeams(tables: BackupTables, projectId: string): number {
  const teams = getTableRows(tables, 'project_teams');
  let max = -1;
  for (const t of teams) {
    if (String(t.project_id ?? '') !== projectId) continue;
    const so = typeof t.sort_order === 'number' ? t.sort_order : Number(t.sort_order) || 0;
    if (so > max) max = so;
  }
  return max;
}

export function maxSortOrderForTeamTopics(tables: BackupTables, teamId: string): number {
  const topics = getTableRows(tables, 'project_topics');
  let max = -1;
  for (const t of topics) {
    if (String(t.team_id ?? '') !== teamId) continue;
    const so = typeof t.sort_order === 'number' ? t.sort_order : Number(t.sort_order) || 0;
    if (so > max) max = so;
  }
  return max;
}

export type TopicListItem = {
  id: string;
  team_id: string;
  team_name: string;
  title: string;
  sort_order: number;
  project_id: string;
};

/** Topics under all project_teams for this project (joins team name). */
export function listTopicsForProject(tables: BackupTables, projectId: string): TopicListItem[] {
  const teams = getTableRows(tables, 'project_teams');
  const teamIds = new Set<string>();
  const teamName = new Map<string, string>();
  for (const tm of teams) {
    if (String(tm.project_id ?? '') !== projectId) continue;
    const id = String(tm.id ?? '');
    teamIds.add(id);
    teamName.set(id, String(tm.name ?? ''));
  }
  const topics = getTableRows(tables, 'project_topics');
  const out: TopicListItem[] = [];
  for (const t of topics) {
    const teamId = String(t.team_id ?? '');
    if (!teamIds.has(teamId)) continue;
    out.push({
      id: String(t.id ?? ''),
      team_id: teamId,
      team_name: teamName.get(teamId) ?? teamId,
      title: String(t.title ?? ''),
      sort_order: typeof t.sort_order === 'number' ? t.sort_order : Number(t.sort_order) || 0,
      project_id: projectId,
    });
  }
  out.sort((a, b) => {
    if (a.team_id !== b.team_id) return a.team_id.localeCompare(b.team_id);
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.id.localeCompare(b.id);
  });
  return out;
}

/** PATCH delete ops for cloud backup JSON (children before parents). */
export type BackupDeleteOp =
  | { op: 'delete'; table: 'project_sub_topic_details'; id: string }
  | { op: 'delete'; table: 'project_sub_topics'; id: string }
  | { op: 'delete'; table: 'project_topics'; id: string }
  | { op: 'delete'; table: 'project_teams'; id: string }
  | { op: 'delete'; table: 'projects'; id: string }
  | { op: 'delete'; table: 'cap_projects'; composite_id: { cap_id: string; project_id: string } };

function detailIdsForSubTopic(tables: BackupTables, subTopicId: string): string[] {
  const details = getTableRows(tables, 'project_sub_topic_details');
  return details.filter((d) => String(d.sub_topic_id ?? '') === subTopicId).map((d) => String(d.id ?? ''));
}

export function buildDeleteTaskOps(tables: BackupTables, detailId: string): BackupDeleteOp[] | null {
  if (!detailExists(tables, detailId)) return null;
  return [{ op: 'delete', table: 'project_sub_topic_details', id: detailId }];
}

export function buildDeleteTopicOps(tables: BackupTables, topicId: string): BackupDeleteOp[] | null {
  if (!topicExists(tables, topicId)) return null;
  const subTopics = getTableRows(tables, 'project_sub_topics').filter((s) => String(s.topic_id ?? '') === topicId);
  const ops: BackupDeleteOp[] = [];
  for (const s of subTopics) {
    const sid = String(s.id ?? '');
    for (const did of detailIdsForSubTopic(tables, sid)) {
      ops.push({ op: 'delete', table: 'project_sub_topic_details', id: did });
    }
    ops.push({ op: 'delete', table: 'project_sub_topics', id: sid });
  }
  ops.push({ op: 'delete', table: 'project_topics', id: topicId });
  return ops;
}

export function buildDeleteSubTopicOps(tables: BackupTables, subTopicId: string): BackupDeleteOp[] | null {
  if (!subTopicExists(tables, subTopicId)) return null;
  const ops: BackupDeleteOp[] = [];
  for (const did of detailIdsForSubTopic(tables, subTopicId)) {
    ops.push({ op: 'delete', table: 'project_sub_topic_details', id: did });
  }
  ops.push({ op: 'delete', table: 'project_sub_topics', id: subTopicId });
  return ops;
}

export function buildDeleteTeamOps(tables: BackupTables, teamId: string): BackupDeleteOp[] | null {
  if (!teamExists(tables, teamId)) return null;
  const topics = getTableRows(tables, 'project_topics').filter((t) => String(t.team_id ?? '') === teamId);
  const ops: BackupDeleteOp[] = [];
  for (const t of topics) {
    const inner = buildDeleteTopicOps(tables, String(t.id ?? ''));
    if (inner) ops.push(...inner);
  }
  ops.push({ op: 'delete', table: 'project_teams', id: teamId });
  return ops;
}

export function buildDeleteProjectOps(tables: BackupTables, projectId: string): BackupDeleteOp[] | null {
  if (!projectExists(tables, projectId)) return null;
  const teams = getTableRows(tables, 'project_teams').filter((t) => String(t.project_id ?? '') === projectId);
  const ops: BackupDeleteOp[] = [];
  for (const tm of teams) {
    const inner = buildDeleteTeamOps(tables, String(tm.id ?? ''));
    if (inner) ops.push(...inner);
  }
  const capRows = getTableRows(tables, 'cap_projects').filter((c) => String(c.project_id ?? '') === projectId);
  for (const c of capRows) {
    ops.push({
      op: 'delete',
      table: 'cap_projects',
      composite_id: { cap_id: String(c.cap_id ?? ''), project_id: String(c.project_id ?? '') },
    });
  }
  ops.push({ op: 'delete', table: 'projects', id: projectId });
  return ops;
}

export function capExists(tables: BackupTables, capId: string): boolean {
  return !!rowById(getTableRows(tables, 'caps'), capId);
}

export function orgTeamExists(tables: BackupTables, teamId: string): boolean {
  return !!rowById(getTableRows(tables, 'org_teams'), teamId);
}

/** Global capability column order (capability_order.sort_order PK). */
export function maxCapabilityOrderSort(tables: BackupTables): number {
  const rows = getTableRows(tables, 'capability_order');
  let max = -1;
  for (const r of rows) {
    const so = typeof r.sort_order === 'number' ? r.sort_order : Number(r.sort_order) || 0;
    if (so > max) max = so;
  }
  return max;
}

export function maxSortOrderCapProjects(tables: BackupTables, capId: string): number {
  const rows = getTableRows(tables, 'cap_projects').filter((c) => String(c.cap_id ?? '') === capId);
  let max = -1;
  for (const r of rows) {
    const so = typeof r.sort_order === 'number' ? r.sort_order : Number(r.sort_order) || 0;
    if (so > max) max = so;
  }
  return max;
}

export function capProjectLinkExists(tables: BackupTables, capId: string, projectId: string): boolean {
  return getTableRows(tables, 'cap_projects').some(
    (r) => String(r.cap_id ?? '') === capId && String(r.project_id ?? '') === projectId,
  );
}

export function allCapIds(tables: BackupTables): string[] {
  return getTableRows(tables, 'caps').map((r) => String(r.id ?? ''));
}

export function allOrgTeamIds(tables: BackupTables): string[] {
  return getTableRows(tables, 'org_teams').map((r) => String(r.id ?? ''));
}
