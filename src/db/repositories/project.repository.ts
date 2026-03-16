/**
 * Domain repository: Project (aggregate of projects + project_teams + topics + sub_topics + details).
 * Frontend pages call this; it uses table repositories and runs transactions.
 */
import type { ProjectData } from '../../types';
import type { ProjectSummary } from '../../types';
import { nameToId, sanitizeId } from '../../lib/idUtils';
import * as client from '../client';
import * as projectsTable from './projects.repository';
import * as projectTeamsTable from './project_teams.repository';
import * as projectTopicsTable from './project_topics.repository';
import * as projectSubTopicsTable from './project_sub_topics.repository';
import * as projectDetailsTable from './project_sub_topic_details.repository';

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function listProjects(): Promise<{ projects: ProjectSummary[] }> {
  const { resultRows } = await client.exec<{
    id: string;
    name: string;
    description: string | null;
    summary_status: string | null;
  }>(`
    SELECT p.id, p.name, p.description,
           (SELECT s.status FROM project_sub_topics s
            JOIN project_topics t ON t.id = s.topic_id
            JOIN project_teams tm ON tm.id = t.team_id
            WHERE tm.project_id = p.id
            ORDER BY CASE s.status WHEN 'RED' THEN 3 WHEN 'YELLOW' THEN 2 ELSE 1 END DESC
            LIMIT 1) AS summary_status
    FROM projects p
    ORDER BY p.id
  `);
  const projects: ProjectSummary[] = (resultRows ?? []).map((r) => ({
    id: String(r.id ?? ''),
    name: String(r.name ?? r.id ?? ''),
    description: r.description != null ? String(r.description) : null,
    summaryStatus: (r.summary_status === 'RED' || r.summary_status === 'YELLOW' || r.summary_status === 'GREEN'
      ? r.summary_status
      : null) as ProjectSummary['summaryStatus'],
  }));
  return { projects };
}

export type ProjectSearchContext = { teamName: string; topicTitle: string; subTopicTitle: string };

export type ProjectForSearch = ProjectSummary & { context: ProjectSearchContext[] };

/** List projects with topic/subtopic context for search (name, id, team/topic/subtopic titles). */
export async function listProjectsForSearch(): Promise<{ projects: ProjectForSearch[] }> {
  const { resultRows } = await client.exec<{
    project_id: string;
    project_name: string;
    description: string | null;
    summary_status: string | null;
    team_name: string | null;
    topic_title: string | null;
    sub_title: string | null;
  }>(`
    SELECT p.id AS project_id, p.name AS project_name, p.description,
           (SELECT s.status FROM project_sub_topics s
            JOIN project_topics t ON t.id = s.topic_id
            JOIN project_teams tm ON tm.id = t.team_id
            WHERE tm.project_id = p.id
            ORDER BY CASE s.status WHEN 'RED' THEN 3 WHEN 'YELLOW' THEN 2 ELSE 1 END DESC
            LIMIT 1) AS summary_status,
           tm.name AS team_name, t.title AS topic_title, s.title AS sub_title
    FROM projects p
    LEFT JOIN project_teams tm ON tm.project_id = p.id
    LEFT JOIN project_topics t ON t.team_id = tm.id
    LEFT JOIN project_sub_topics s ON s.topic_id = t.id
    ORDER BY p.id, tm.sort_order, t.sort_order, s.sort_order
  `);

  const byId = new Map<
    string,
    { name: string; description: string | null; summaryStatus: ProjectSummary['summaryStatus']; context: ProjectSearchContext[] }
  >();
  for (const r of resultRows ?? []) {
    const id = String(r.project_id ?? '');
    if (!byId.has(id)) {
      byId.set(id, {
        name: String(r.project_name ?? r.project_id ?? ''),
        description: r.description != null ? String(r.description) : null,
        summaryStatus:
          r.summary_status === 'RED' || r.summary_status === 'YELLOW' || r.summary_status === 'GREEN'
            ? r.summary_status
            : null,
        context: [],
      });
    }
    const rec = byId.get(id)!;
    const teamName = r.team_name != null ? String(r.team_name).trim() : '';
    const topicTitle = r.topic_title != null ? String(r.topic_title).trim() : '';
    const subTitle = r.sub_title != null ? String(r.sub_title).trim() : '';
    if (teamName || topicTitle || subTitle) {
      const existing = rec.context.some(
        (c) => c.teamName === teamName && c.topicTitle === topicTitle && c.subTopicTitle === subTitle
      );
      if (!existing) rec.context.push({ teamName, topicTitle, subTopicTitle: subTitle });
    }
  }

  const projects: ProjectForSearch[] = Array.from(byId.entries()).map(([id, v]) => ({
    id,
    name: v.name,
    description: v.description ?? undefined,
    summaryStatus: v.summaryStatus,
    context: v.context,
  }));
  return { projects };
}

export async function getProject(id: string): Promise<{ id: string; data: ProjectData } | null> {
  const safeId = sanitizeId(id) || 'project';
  const proj = await projectsTable.getById(safeId);
  if (!proj) return null;

  const teams: ProjectData['teams'] = [];
  const teamRows = await projectTeamsTable.getByProjectId(safeId);
  for (const tm of teamRows) {
    const topics: ProjectData['teams'][0]['topics'] = [];
    const topicRows = await projectTopicsTable.getByTeamId(tm.id);
    for (const top of topicRows) {
      const subTopics: ProjectData['teams'][0]['topics'][0]['subTopics'] = [];
      const subRows = await projectSubTopicsTable.getByTopicId(top.id);
      for (const sub of subRows) {
        const detailRows = await projectDetailsTable.getBySubTopicId(sub.id);
        const details = detailRows.map((d) => ({
          text: d.text ?? '',
          description: d.description ?? undefined,
          status: (d.status === 'done' || d.status === 'doing' ? d.status : 'todo') as 'todo' | 'doing' | 'done',
          dueDate: d.due_date ?? undefined,
        }));
        subTopics.push({
          id: sub.id,
          title: sub.title ?? 'SubTopic',
          status: (sub.status === 'RED' || sub.status === 'YELLOW' ? sub.status : 'GREEN') as 'GREEN' | 'YELLOW' | 'RED',
          subTopicType: sub.sub_topic_type === 'status' ? 'status' : 'todos',
          details,
        });
      }
      topics.push({ id: top.id, title: top.title ?? 'Topic', subTopics });
    }
    teams.push({ id: tm.id, name: tm.name ?? 'Team', topics });
  }
  return {
    id: safeId,
    data: {
      id: safeId,
      projectName: proj.name ?? safeId,
      description: proj.description ?? undefined,
      teams,
    },
  };
}

export async function createProject(name: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const projectName = (name || '').trim();
  if (!projectName) return { ok: false, error: 'กรุณาระบุชื่อโปรเจกต์' };
  const fileId = sanitizeId(nameToId(projectName)) || 'project';
  const existing = await projectsTable.getById(fileId);
  if (existing) return { ok: false, error: 'project id นี้มีอยู่แล้ว', id: fileId };
  await projectsTable.insert({ id: fileId, name: projectName, description: null });
  return { ok: true, id: fileId };
}

export async function saveProject(projectName: string, data: ProjectData): Promise<{ ok: boolean; id: string; error?: string }> {
  const name = (projectName || data.projectName || 'project').trim();
  const id = sanitizeId(data.id || nameToId(name)) || sanitizeId(nameToId(name)) || 'project';

  await client.runInTransaction(async () => {
    await projectsTable.replace({
      id,
      name: data.projectName ?? name,
      description: data.description ?? null,
    });

    await client.execRun(
      'DELETE FROM project_sub_topic_details WHERE sub_topic_id IN (SELECT id FROM project_sub_topics WHERE topic_id IN (SELECT id FROM project_topics WHERE team_id IN (SELECT id FROM project_teams WHERE project_id = ?)))',
      [id]
    );
    await client.execRun(
      'DELETE FROM project_sub_topics WHERE topic_id IN (SELECT id FROM project_topics WHERE team_id IN (SELECT id FROM project_teams WHERE project_id = ?))',
      [id]
    );
    await client.execRun('DELETE FROM project_topics WHERE team_id IN (SELECT id FROM project_teams WHERE project_id = ?)', [id]);
    await projectTeamsTable.deleteByProjectId(id);

    let teamOrder = 0;
    for (const team of data.teams ?? []) {
      const teamId = team.id || genId('t');
      await projectTeamsTable.insert({ id: teamId, project_id: id, name: team.name ?? 'Team', sort_order: teamOrder++ });
      let topicOrder = 0;
      for (const topic of team.topics ?? []) {
        const topicId = topic.id || genId('top');
        await projectTopicsTable.insert({ id: topicId, team_id: teamId, title: topic.title ?? 'Topic', sort_order: topicOrder++ });
        let subOrder = 0;
        for (const sub of topic.subTopics ?? []) {
          const subId = sub.id || genId('sub');
          const status = sub.status === 'RED' || sub.status === 'YELLOW' ? sub.status : 'GREEN';
          const subType = sub.subTopicType === 'status' ? 'status' : 'todos';
          await projectSubTopicsTable.insert({
            id: subId,
            topic_id: topicId,
            title: sub.title ?? 'SubTopic',
            status,
            sub_topic_type: subType,
            sort_order: subOrder++,
          });
          let detailOrder = 0;
          for (const d of sub.details ?? []) {
            const detailId = (d as { id?: string }).id || genId('d');
            const st = d.status === 'done' || d.status === 'doing' ? d.status : 'todo';
            await projectDetailsTable.insert({
              id: detailId,
              sub_topic_id: subId,
              text: d.text ?? '',
              description: d.description ?? null,
              status: st,
              due_date: d.dueDate ?? null,
              sort_order: detailOrder++,
            });
          }
        }
      }
    }
  });

  return { ok: true, id };
}
