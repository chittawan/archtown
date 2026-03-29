/**
 * Domain repository: Project (aggregate of projects + project_teams + topics + sub_topics + details).
 * Frontend pages call this; it uses table repositories and runs transactions.
 */
import type { ProjectData, ProjectSummary, TaskHealthRag } from '../../types';
import { genDetailRowId, nameToId, sanitizeId } from '../../lib/idUtils';
import * as client from '../client';
import {
  enqueuePatchDelete,
  enqueuePatchInsert,
  enqueuePatchUpdate,
  enqueueSyncOpsBatch,
  type SyncPatchOp,
} from '../pendingSyncOps';
import * as projectsTable from './projects.repository';
import * as projectTeamsTable from './project_teams.repository';
import * as projectTopicsTable from './project_topics.repository';
import * as projectSubTopicsTable from './project_sub_topics.repository';
import * as projectDetailsTable from './project_sub_topic_details.repository';

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Collect ids still in SQLite for this project, then queue PATCH deletes (details → subs → topics → teams). */
async function enqueueProjectSubtreeDeletes(projectId: string): Promise<void> {
  const { resultRows: detailIds } = await client.exec<{ id: string }>(
    `SELECT d.id FROM project_sub_topic_details d
     INNER JOIN project_sub_topics s ON s.id = d.sub_topic_id
     INNER JOIN project_topics t ON t.id = s.topic_id
     INNER JOIN project_teams tm ON tm.id = t.team_id
     WHERE tm.project_id = ?`,
    [projectId]
  );
  for (const r of detailIds ?? []) {
    enqueuePatchDelete('project_sub_topic_details', r.id);
  }

  const { resultRows: subIds } = await client.exec<{ id: string }>(
    `SELECT s.id FROM project_sub_topics s
     INNER JOIN project_topics t ON t.id = s.topic_id
     INNER JOIN project_teams tm ON tm.id = t.team_id
     WHERE tm.project_id = ?`,
    [projectId]
  );
  for (const r of subIds ?? []) {
    enqueuePatchDelete('project_sub_topics', r.id);
  }

  const { resultRows: topicIds } = await client.exec<{ id: string }>(
    `SELECT t.id FROM project_topics t
     INNER JOIN project_teams tm ON tm.id = t.team_id
     WHERE tm.project_id = ?`,
    [projectId]
  );
  for (const r of topicIds ?? []) {
    enqueuePatchDelete('project_topics', r.id);
  }

  const { resultRows: teamIds } = await client.exec<{ id: string }>(
    `SELECT id FROM project_teams WHERE project_id = ?`,
    [projectId]
  );
  for (const r of teamIds ?? []) {
    enqueuePatchDelete('project_teams', r.id);
  }
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
          id: d.id,
          text: d.text ?? '',
          description: d.description ?? undefined,
          status: (d.status === 'done' || d.status === 'doing' ? d.status : 'todo') as 'todo' | 'doing' | 'done',
          dueDate: d.due_date ?? undefined,
          health:
            d.health === 'RED' || d.health === 'YELLOW' || d.health === 'GREEN'
              ? (d.health as TaskHealthRag)
              : undefined,
          healthNote: d.health_note != null ? d.health_note : undefined,
          healthReviewedAt: d.health_reviewed_at != null ? d.health_reviewed_at : undefined,
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
  enqueuePatchInsert('projects', { id: fileId, name: projectName, description: null });
  return { ok: true, id: fileId };
}

export async function saveProject(projectName: string, data: ProjectData): Promise<{ ok: boolean; id: string; error?: string }> {
  const name = (projectName || data.projectName || 'project').trim();
  const id = sanitizeId(data.id || nameToId(name)) || sanitizeId(nameToId(name)) || 'project';

  const existingProject = await projectsTable.getById(id);
  const projectExisted = !!existingProject;

  // Read existing single-PK tables for diff generation
  const existingTeams = (
    await client.exec<{ id: string; name: string; sort_order: number }>(`SELECT id, name, sort_order FROM project_teams WHERE project_id = ?`, [id])
  ).resultRows ?? [];

  const existingTopics = (
    await client.exec<{ id: string; team_id: string; title: string; sort_order: number }>(
      `SELECT pt.id, pt.team_id, pt.title, pt.sort_order
       FROM project_topics pt
       INNER JOIN project_teams tm ON tm.id = pt.team_id
       WHERE tm.project_id = ?
       ORDER BY pt.sort_order, pt.id`,
      [id]
    )
  ).resultRows ?? [];

  const existingSubTopics = (
    await client.exec<{ id: string; topic_id: string; title: string; status: string; sub_topic_type: string; sort_order: number }>(
      `SELECT st.id, st.topic_id, st.title, st.status, st.sub_topic_type, st.sort_order
       FROM project_sub_topics st
       INNER JOIN project_topics pt ON pt.id = st.topic_id
       INNER JOIN project_teams tm ON tm.id = pt.team_id
       WHERE tm.project_id = ?
       ORDER BY st.sort_order, st.id`,
      [id]
    )
  ).resultRows ?? [];

  const existingDetails = (
    await client.exec<{
      id: string;
      sub_topic_id: string;
      text: string;
      description: string | null;
      status: string;
      due_date: string | null;
      sort_order: number;
      health: string | null;
      health_note: string | null;
      health_reviewed_at: string | null;
      health_updated_at: string | null;
      health_note_updated_at: string | null;
      health_reviewed_at_updated_at: string | null;
    }>(
      `SELECT d.id, d.sub_topic_id, d.text, d.description, d.status, d.due_date, d.sort_order,
              d.health, d.health_note, d.health_reviewed_at,
              d.health_updated_at, d.health_note_updated_at, d.health_reviewed_at_updated_at
       FROM project_sub_topic_details d
       INNER JOIN project_sub_topics st ON st.id = d.sub_topic_id
       INNER JOIN project_topics pt ON pt.id = st.topic_id
       INNER JOIN project_teams tm ON tm.id = pt.team_id
       WHERE tm.project_id = ?
       ORDER BY d.sort_order, d.id`,
      [id]
    )
  ).resultRows ?? [];

  const existingTeamsById = new Map(existingTeams.map((r) => [r.id, r]));
  const existingTopicsById = new Map(existingTopics.map((r) => [r.id, r]));
  const existingSubTopicsById = new Map(existingSubTopics.map((r) => [r.id, r]));
  const existingDetailsById = new Map(existingDetails.map((r) => [r.id, r]));
  const detailMetaTs = new Date().toISOString();

  // Materialize next rows with final ids + computed sort orders
  let teamOrder = 0;
  const nextTeams: Array<{ id: string; project_id: string; name: string; sort_order: number }> = [];
  let nextTeamIds = new Set<string>();

  const nextTopics: Array<{ id: string; team_id: string; title: string; sort_order: number }> = [];
  let nextTopicIds = new Set<string>();

  const nextSubTopics: Array<{
    id: string;
    topic_id: string;
    title: string;
    status: string;
    sub_topic_type: string;
    sort_order: number;
  }> = [];
  let nextSubTopicIds = new Set<string>();

  const nextDetails: Array<{
    id: string;
    sub_topic_id: string;
    text: string;
    description: string | null;
    status: string;
    due_date: string | null;
    sort_order: number;
    health: string | null;
    health_note: string | null;
    health_reviewed_at: string | null;
    health_updated_at: string | null;
    health_note_updated_at: string | null;
    health_reviewed_at_updated_at: string | null;
  }> = [];
  let nextDetailIds = new Set<string>();

  for (const team of data.teams ?? []) {
    const teamId = team.id || genId('t');
    const teamRow = { id: teamId, project_id: id, name: team.name ?? 'Team', sort_order: teamOrder++ };
    nextTeams.push(teamRow);
    nextTeamIds.add(teamId);

    let topicOrder = 0;
    for (const topic of team.topics ?? []) {
      const topicId = topic.id || genId('top');
      const topicRow = { id: topicId, team_id: teamId, title: topic.title ?? 'Topic', sort_order: topicOrder++ };
      nextTopics.push(topicRow);
      nextTopicIds.add(topicId);

      let subOrder = 0;
      for (const sub of topic.subTopics ?? []) {
        const subId = sub.id || genId('sub');
        const status = sub.status === 'RED' || sub.status === 'YELLOW' ? sub.status : 'GREEN';
        const subType = sub.subTopicType === 'status' ? 'status' : 'todos';
        const subRow = {
          id: subId,
          topic_id: topicId,
          title: sub.title ?? 'SubTopic',
          status,
          sub_topic_type: subType,
          sort_order: subOrder++,
        };
        nextSubTopics.push(subRow);
        nextSubTopicIds.add(subId);

        let detailOrder = 0;
        for (const d of sub.details ?? []) {
          const detailId = (typeof d.id === 'string' && d.id.trim() ? d.id.trim() : null) || genDetailRowId();
          const st = d.status === 'done' || d.status === 'doing' ? d.status : 'todo';
          const healthVal =
            d.health === 'RED' || d.health === 'YELLOW' || d.health === 'GREEN' ? d.health : null;
          const healthNote = d.healthNote ?? null;
          const healthReviewedAt = d.healthReviewedAt ?? null;
          const prevD = existingDetailsById.get(detailId);
          const healthChanged = (prevD?.health ?? null) !== (healthVal ?? null);
          const healthNoteChanged = (prevD?.health_note ?? null) !== (healthNote ?? null);
          const healthReviewedChanged = (prevD?.health_reviewed_at ?? null) !== (healthReviewedAt ?? null);
          const detailRow = {
            id: detailId,
            sub_topic_id: subId,
            text: d.text ?? '',
            description: d.description ?? null,
            status: st,
            due_date: d.dueDate ?? null,
            sort_order: detailOrder++,
            health: healthVal,
            health_note: healthNote,
            health_reviewed_at: healthReviewedAt,
            health_updated_at: healthChanged ? detailMetaTs : (prevD?.health_updated_at ?? null),
            health_note_updated_at: healthNoteChanged
              ? detailMetaTs
              : (prevD?.health_note_updated_at ?? null),
            health_reviewed_at_updated_at: healthReviewedChanged
              ? detailMetaTs
              : (prevD?.health_reviewed_at_updated_at ?? null),
          };
          nextDetails.push(detailRow);
          nextDetailIds.add(detailId);
        }
      }
    }
  }

  // Generate patch ops (enqueued only after SQLite transaction success)
  const deleteTeamIds = existingTeams.filter((t) => !nextTeamIds.has(t.id)).map((t) => t.id);
  const deleteTopicIds = existingTopics.filter((t) => !nextTopicIds.has(t.id)).map((t) => t.id);
  const deleteSubTopicIds = existingSubTopics.filter((s) => !nextSubTopicIds.has(s.id)).map((s) => s.id);
  const deleteDetailIds = existingDetails.filter((d) => !nextDetailIds.has(d.id)).map((d) => d.id);

  const insertTeamRows = nextTeams.filter((t) => !existingTeamsById.has(t.id));
  const insertTopicRows = nextTopics.filter((t) => !existingTopicsById.has(t.id));
  const insertSubTopicRows = nextSubTopics.filter((s) => !existingSubTopicsById.has(s.id));
  const insertDetailRows = nextDetails.filter((d) => !existingDetailsById.has(d.id));

  const updateTeamsFields = Array.from(nextTeamIds)
    .filter((tid) => existingTeamsById.has(tid))
    .map((tid) => {
      const prev = existingTeamsById.get(tid)!;
      const next = nextTeams.find((t) => t.id === tid)!;
      const fields: Record<string, unknown> = {};
      if (prev.name !== next.name) fields.name = next.name;
      if (prev.sort_order !== next.sort_order) fields.sort_order = next.sort_order;
      return { id: tid, fields };
    })
    .filter((x) => Object.keys(x.fields).length > 0);

  const updateTopicsFields = Array.from(nextTopicIds)
    .filter((tid) => existingTopicsById.has(tid))
    .map((tid) => {
      const prev = existingTopicsById.get(tid)!;
      const next = nextTopics.find((t) => t.id === tid)!;
      const fields: Record<string, unknown> = {};
      if (prev.title !== next.title) fields.title = next.title;
      if (prev.sort_order !== next.sort_order) fields.sort_order = next.sort_order;
      return { id: tid, fields };
    })
    .filter((x) => Object.keys(x.fields).length > 0);

  const updateSubTopicsFields = Array.from(nextSubTopicIds)
    .filter((sid) => existingSubTopicsById.has(sid))
    .map((sid) => {
      const prev = existingSubTopicsById.get(sid)!;
      const next = nextSubTopics.find((s) => s.id === sid)!;
      const fields: Record<string, unknown> = {};
      if (prev.title !== next.title) fields.title = next.title;
      if (prev.status !== next.status) fields.status = next.status;
      if (prev.sub_topic_type !== next.sub_topic_type) fields.sub_topic_type = next.sub_topic_type;
      if (prev.sort_order !== next.sort_order) fields.sort_order = next.sort_order;
      return { id: sid, fields };
    })
    .filter((x) => Object.keys(x.fields).length > 0);

  const updateDetailFields = Array.from(nextDetailIds)
    .filter((did) => existingDetailsById.has(did))
    .map((did) => {
      const prev = existingDetailsById.get(did)!;
      const next = nextDetails.find((d) => d.id === did)!;
      const fields: Record<string, unknown> = {};
      if (prev.text !== next.text) fields.text = next.text;
      if (prev.description !== next.description) fields.description = next.description;
      if (prev.status !== next.status) fields.status = next.status;
      if (prev.due_date !== next.due_date) fields.due_date = next.due_date;
      if (prev.sort_order !== next.sort_order) fields.sort_order = next.sort_order;
      if ((prev.health ?? null) !== (next.health ?? null)) fields.health = next.health;
      if ((prev.health_note ?? null) !== (next.health_note ?? null)) fields.health_note = next.health_note;
      if ((prev.health_reviewed_at ?? null) !== (next.health_reviewed_at ?? null)) {
        fields.health_reviewed_at = next.health_reviewed_at;
      }
      return { id: did, fields };
    })
    .filter((x) => Object.keys(x.fields).length > 0);

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

    for (const t of nextTeams) await projectTeamsTable.insert(t);
    for (const t of nextTopics) await projectTopicsTable.insert(t);
    for (const s of nextSubTopics) await projectSubTopicsTable.insert(s);
    for (const d of nextDetails) await projectDetailsTable.insert(d);
  });

  const ts = new Date().toISOString();

  // projects (name, description)
  if (projectExisted) {
    const fields: Record<string, unknown> = {};
    const nextName = data.projectName ?? name;
    const nextDesc = data.description ?? null;
    if ((existingProject?.name ?? null) !== nextName) fields.name = nextName;
    if ((existingProject?.description ?? null) !== nextDesc) fields.description = nextDesc;
    if (Object.keys(fields).length > 0) enqueuePatchUpdate('projects', id, fields, ts);
  } else {
    enqueuePatchInsert('projects', {
      id,
      name: data.projectName ?? name,
      description: data.description ?? null,
    });
  }

  // delete removed rows first (children → parents)
  for (const did of deleteDetailIds) enqueuePatchDelete('project_sub_topic_details', did);
  for (const sid of deleteSubTopicIds) enqueuePatchDelete('project_sub_topics', sid);
  for (const tid of deleteTopicIds) enqueuePatchDelete('project_topics', tid);
  for (const tid of deleteTeamIds) enqueuePatchDelete('project_teams', tid);

  // insert new rows
  for (const row of insertTeamRows) enqueuePatchInsert('project_teams', row);
  for (const row of insertTopicRows) enqueuePatchInsert('project_topics', row);
  for (const row of insertSubTopicRows) enqueuePatchInsert('project_sub_topics', row);
  for (const row of insertDetailRows) enqueuePatchInsert('project_sub_topic_details', row);

  // update existing rows (field-level)
  for (const u of updateTeamsFields) enqueuePatchUpdate('project_teams', u.id, u.fields, ts);
  for (const u of updateTopicsFields) enqueuePatchUpdate('project_topics', u.id, u.fields, ts);
  for (const u of updateSubTopicsFields) enqueuePatchUpdate('project_sub_topics', u.id, u.fields, ts);
  for (const u of updateDetailFields) enqueuePatchUpdate('project_sub_topic_details', u.id, u.fields, ts);

  return { ok: true, id };
}
