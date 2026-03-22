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
    });
  }

  return out;
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

export function detailExists(tables: BackupTables, detailId: string): boolean {
  return !!rowById(getTableRows(tables, 'project_sub_topic_details'), detailId);
}
