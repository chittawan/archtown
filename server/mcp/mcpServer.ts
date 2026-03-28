import { randomBytes } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { ensureUniqueId, nameToId, sanitizeId } from '../lib/idUtils.ts';
import { fetchDownloadJson, fetchEaJson, fetchPatch, fetchUndo } from './archtownApi';
import {
  aggregateProjects,
  allCapIds,
  allOrgTeamIds,
  buildDeleteProjectOps,
  buildDeleteSubTopicOps,
  buildDeleteTaskOps,
  buildDeleteTopicOps,
  type BackupDeleteOp,
  capExists,
  capProjectLinkExists,
  detailExists,
  getTableRows,
  listTasksFiltered,
  listTopicsForProject,
  maxCapabilityOrderSort,
  maxSortOrderCapProjects,
  maxSortOrderForProjectTeams,
  maxSortOrderForSubTopic,
  maxSortOrderForTeamTopics,
  maxSortOrderForTopic,
  orgTeamExists,
  parseBackupTables,
  projectExists,
  subTopicExists,
  teamExists,
  topicExists,
} from './projectAggregates';
import type { ArchtownMcpContext } from './types';

function toolJson(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

function toolErr(message: string) {
  return {
    isError: true as const,
    content: [{ type: 'text' as const, text: message }],
  };
}

/** First line: ArchTown MCP claim marker (parseable). */
const ARCHTOWN_CLAIM_LINE_RE = /^\[archtown-claim agent=(.+?) ts=([^\]]+)\]\s*$/;

function parseLeadingClaim(firstLine: string): { agent: string } | null {
  const m = firstLine.match(ARCHTOWN_CLAIM_LINE_RE);
  if (m) return { agent: m[1].trim() };
  const legacy = firstLine.match(/^\[claimed by (.+?) at /);
  if (legacy) return { agent: legacy[1].trim() };
  return null;
}

/** Removes one leading claim line (ArchTown or legacy) from description; returns body text and prior claimer if any. */
function stripLeadingClaimDescription(desc: string | null | undefined): { body: string; claimedBy: string | undefined } {
  if (desc == null || desc === '') return { body: '', claimedBy: undefined };
  const s = String(desc);
  const nl = s.indexOf('\n');
  const first = nl === -1 ? s : s.slice(0, nl);
  const rest = nl === -1 ? '' : s.slice(nl + 1);
  const claim = parseLeadingClaim(first);
  if (!claim) return { body: s, claimedBy: undefined };
  return { body: rest, claimedBy: claim.agent };
}

async function applyPatchOpsBatches(
  ctx: ArchtownMcpContext,
  startVersion: number,
  ops: BackupDeleteOp[],
): Promise<{ ok: true; version: number; batches: number } | { ok: false; status: number; text: string }> {
  let version = startVersion;
  let batches = 0;
  for (let i = 0; i < ops.length; i += 100) {
    const batch = ops.slice(i, i + 100);
    const patch = await fetchPatch(ctx, { base_version: version, ops: batch });
    if (patch.ok === false) return { ok: false, status: patch.status, text: patch.text };
    const body = patch.data as Record<string, unknown>;
    version = typeof body.version === 'number' ? body.version : Number(body.version ?? version);
    batches += 1;
  }
  return { ok: true, version, batches };
}

export function createArchtownMcpServer(ctx: ArchtownMcpContext): McpServer {
  const server = new McpServer({ name: 'archtown', version: '1.0.0' });

  server.registerTool(
    'get_projects',
    {
      description:
        'Fetch cloud backup and return projects[] with subtopic status counts (RED/YELLOW/GREEN) per project.',
    },
    async () => {
      const dl = await fetchDownloadJson(ctx);
      if (dl.ok === false) return toolErr(`download failed (${dl.status}): ${dl.text}`);
      const parsed = parseBackupTables(dl.data);
      if (!parsed) return toolErr('invalid backup shape');
      return toolJson({ projects: aggregateProjects(parsed.tables) });
    },
  );

  server.registerTool(
    'get_tasks',
    {
      description:
        'List tasks from project_sub_topic_details with subtopic title and project name. Filter by status, optional project_id, overdue_only.',
      inputSchema: {
        status: z.enum(['todo', 'doing', 'done', 'all']).optional().describe('Filter by task status; default all'),
        project_id: z.string().optional().describe('Only tasks under this project id'),
        overdue_only: z.boolean().optional().describe('Only tasks with due_date before today and status not done'),
      },
    },
    async (params) => {
      const status = params.status ?? 'all';
      const overdue_only = params.overdue_only ?? false;
      const project_id = params.project_id;
      const dl = await fetchDownloadJson(ctx);
      if (dl.ok === false) return toolErr(`download failed (${dl.status}): ${dl.text}`);
      const parsed = parseBackupTables(dl.data);
      if (!parsed) return toolErr('invalid backup shape');
      const tasks = listTasksFiltered(parsed.tables, { status, project_id, overdue_only });
      return toolJson({ tasks });
    },
  );

  server.registerTool(
    'create_task',
    {
      description: 'Insert a new row in project_sub_topic_details via PATCH /api/sync/patch (op insert).',
      inputSchema: {
        sub_topic_id: z.string().describe('Parent project_sub_topics id'),
        text: z.string().describe('Task title / text'),
        description: z.string().optional().describe('Optional description'),
        due_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('Optional due date YYYY-MM-DD'),
      },
    },
    async (params) => {
      const dl = await fetchDownloadJson(ctx);
      if (dl.ok === false) return toolErr(`download failed (${dl.status}): ${dl.text}`);
      const parsed = parseBackupTables(dl.data);
      if (!parsed) return toolErr('invalid backup shape');
      if (!subTopicExists(parsed.tables, params.sub_topic_id)) {
        return toolErr(`sub_topic not found: ${params.sub_topic_id}`);
      }
      const id = `d-mcp-${Date.now()}-${randomBytes(3).toString('hex')}`;
      const sort_order = maxSortOrderForSubTopic(parsed.tables, params.sub_topic_id) + 1;
      const row = {
        id,
        sub_topic_id: params.sub_topic_id,
        text: params.text,
        description: params.description ?? null,
        status: 'todo',
        due_date: params.due_date ?? null,
        sort_order,
      };
      const patch = await fetchPatch(ctx, {
        base_version: parsed.version,
        ops: [{ op: 'insert', table: 'project_sub_topic_details', row }],
      });
      if (patch.ok === false) return toolErr(`patch failed (${patch.status}): ${patch.text}`);
      const body = patch.data as Record<string, unknown>;
      return toolJson({ ok: body.ok ?? true, version: body.version, id });
    },
  );

  server.registerTool(
    'create_project',
    {
      description:
        'Insert a new row in projects via PATCH /api/sync/patch (op insert). Id is derived from name (same as app: nameToId + sanitize).',
      inputSchema: {
        name: z.string().min(1).describe('Project display name'),
        description: z.string().optional().describe('Optional project description'),
      },
    },
    async (params) => {
      const projectName = params.name.trim();
      if (!projectName) return toolErr('name is required');
      const fileId = sanitizeId(nameToId(projectName)) || 'project';
      const dl = await fetchDownloadJson(ctx);
      if (dl.ok === false) return toolErr(`download failed (${dl.status}): ${dl.text}`);
      const parsed = parseBackupTables(dl.data);
      if (!parsed) return toolErr('invalid backup shape');
      if (projectExists(parsed.tables, fileId)) {
        return toolErr(`project id already exists: ${fileId}`);
      }
      const row = { id: fileId, name: projectName, description: params.description ?? null };
      const patch = await fetchPatch(ctx, {
        base_version: parsed.version,
        ops: [{ op: 'insert', table: 'projects', row }],
      });
      if (patch.ok === false) return toolErr(`patch failed (${patch.status}): ${patch.text}`);
      const body = patch.data as Record<string, unknown>;
      return toolJson({ ok: body.ok ?? true, version: body.version, id: fileId });
    },
  );

  server.registerTool(
    'create_sub_topic',
    {
      description:
        'Insert a new row in project_sub_topics under an existing project_topics row via PATCH /api/sync/patch (op insert).',
      inputSchema: {
        topic_id: z.string().describe('Parent project_topics id'),
        title: z.string().min(1).describe('Sub-topic title'),
        status: z.enum(['GREEN', 'YELLOW', 'RED']).optional().describe('Roll-up status; default GREEN'),
        sub_topic_type: z.enum(['todos', 'status']).optional().describe('Default todos'),
      },
    },
    async (params) => {
      const dl = await fetchDownloadJson(ctx);
      if (dl.ok === false) return toolErr(`download failed (${dl.status}): ${dl.text}`);
      const parsed = parseBackupTables(dl.data);
      if (!parsed) return toolErr('invalid backup shape');
      if (!topicExists(parsed.tables, params.topic_id)) {
        return toolErr(`topic not found: ${params.topic_id}`);
      }
      const id = `st-mcp-${Date.now()}-${randomBytes(3).toString('hex')}`;
      const sort_order = maxSortOrderForTopic(parsed.tables, params.topic_id) + 1;
      const status = params.status ?? 'GREEN';
      const sub_topic_type = params.sub_topic_type ?? 'todos';
      const row = {
        id,
        topic_id: params.topic_id,
        title: params.title.trim(),
        status,
        sub_topic_type,
        sort_order,
      };
      const patch = await fetchPatch(ctx, {
        base_version: parsed.version,
        ops: [{ op: 'insert', table: 'project_sub_topics', row }],
      });
      if (patch.ok === false) return toolErr(`patch failed (${patch.status}): ${patch.text}`);
      const body = patch.data as Record<string, unknown>;
      return toolJson({ ok: body.ok ?? true, version: body.version, id });
    },
  );

  server.registerTool(
    'update_task',
    {
      description: 'Update a task row via PATCH /api/sync/patch (op update) with field_updated_at timestamps.',
      inputSchema: {
        id: z.string().describe('project_sub_topic_details id'),
        status: z.enum(['todo', 'doing', 'done']).optional(),
        due_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('Set due date YYYY-MM-DD'),
        text: z.string().optional(),
      },
    },
    async (params) => {
      if (params.status === undefined && params.due_date === undefined && params.text === undefined) {
        return toolErr('at least one of status, due_date, text is required');
      }
      const dl = await fetchDownloadJson(ctx);
      if (dl.ok === false) return toolErr(`download failed (${dl.status}): ${dl.text}`);
      const parsed = parseBackupTables(dl.data);
      if (!parsed) return toolErr('invalid backup shape');
      if (!detailExists(parsed.tables, params.id)) {
        return toolErr(`task not found: ${params.id}`);
      }
      const fields: Record<string, unknown> = {};
      const field_updated_at: Record<string, string> = {};
      const now = new Date().toISOString();
      if (params.text !== undefined) {
        fields.text = params.text;
        field_updated_at.text = now;
      }
      if (params.status !== undefined) {
        fields.status = params.status;
        field_updated_at.status = now;
      }
      if (params.due_date !== undefined) {
        fields.due_date = params.due_date;
        field_updated_at.due_date = now;
      }
      const patch = await fetchPatch(ctx, {
        base_version: parsed.version,
        ops: [
          {
            op: 'update',
            table: 'project_sub_topic_details',
            id: params.id,
            fields,
            field_updated_at,
          },
        ],
      });
      if (patch.ok === false) return toolErr(`patch failed (${patch.status}): ${patch.text}`);
      const body = patch.data as Record<string, unknown>;
      return toolJson({ ok: body.ok ?? true, version: body.version });
    },
  );

  server.registerTool(
    'claim_task',
    {
      description:
        'Claim a task before starting work: sets status to doing and prefixes description with a machine-readable claim line so other agents avoid the same task. Use a stable agent_name per machine (e.g. cursor-a). If another agent already claimed and force is false, returns an error. Retries on sync version conflict (409).',
      inputSchema: {
        id: z.string().describe('project_sub_topic_details id'),
        agent_name: z
          .string()
          .min(1)
          .describe('Stable identifier for this Cursor session/machine, e.g. cursor-a'),
        force: z
          .boolean()
          .optional()
          .describe(
            'If true, overwrite an existing claim by another agent. Default false — refuse when already claimed by someone else.',
          ),
      },
    },
    async (params) => {
      const agentName = params.agent_name.trim();
      if (!agentName) return toolErr('agent_name is required');
      const force = params.force ?? false;
      const taskId = params.id;
      const maxAttempts = 3;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const dl = await fetchDownloadJson(ctx);
        if (dl.ok === false) return toolErr(`download failed (${dl.status}): ${dl.text}`);
        const parsed = parseBackupTables(dl.data);
        if (!parsed) return toolErr('invalid backup shape');
        if (!detailExists(parsed.tables, taskId)) {
          return toolErr(`task not found: ${taskId}`);
        }

        const row = getTableRows(parsed.tables, 'project_sub_topic_details').find((r) => String(r.id ?? '') === taskId);
        if (!row) return toolErr(`task not found: ${taskId}`);

        const status = String(row.status ?? 'todo');
        if (status === 'done') {
          return toolErr('cannot claim a task that is already done');
        }

        const rawDesc = row.description == null ? null : String(row.description);
        const { body: bodyWithoutClaim, claimedBy } = stripLeadingClaimDescription(rawDesc);
        if (claimedBy && claimedBy !== agentName && !force) {
          return toolErr(
            `task already claimed by "${claimedBy}"; pick another task or pass force=true to take over (use sparingly)`,
          );
        }

        const now = new Date().toISOString();
        const claimLine = `[archtown-claim agent=${agentName} ts=${now}]`;
        const newDescription = bodyWithoutClaim === '' ? claimLine : `${claimLine}\n${bodyWithoutClaim}`;

        const patch = await fetchPatch(ctx, {
          base_version: parsed.version,
          ops: [
            {
              op: 'update',
              table: 'project_sub_topic_details',
              id: taskId,
              fields: { status: 'doing', description: newDescription },
              field_updated_at: { status: now, description: now },
            },
          ],
        });

        if (patch.ok === true) {
          const body = patch.data as Record<string, unknown>;
          return toolJson({ ok: body.ok ?? true, version: body.version, claimed: true, agent_name: agentName });
        }

        if (patch.status === 409 && attempt < maxAttempts - 1) {
          continue;
        }
        return toolErr(`patch failed (${patch.status}): ${patch.text}`);
      }

      return toolErr('claim failed after retries (version conflict); call get_tasks and try claim_task again');
    },
  );

  server.registerTool(
    'get_topics',
    {
      description:
        'List project_topics for a project (via project_teams). Returns topic id, title, sort_order, team_id, team_name — use topic ids with create_sub_topic.',
      inputSchema: {
        project_id: z.string().describe('projects.id'),
      },
    },
    async ({ project_id }) => {
      const dl = await fetchDownloadJson(ctx);
      if (dl.ok === false) return toolErr(`download failed (${dl.status}): ${dl.text}`);
      const parsed = parseBackupTables(dl.data);
      if (!parsed) return toolErr('invalid backup shape');
      if (!projectExists(parsed.tables, project_id)) {
        return toolErr(`project not found: ${project_id}`);
      }
      const topics = listTopicsForProject(parsed.tables, project_id);
      return toolJson({ topics });
    },
  );

  server.registerTool(
    'create_team',
    {
      description:
        'Insert a project_teams row (team column within a project). Topics are created under a team via create_topic.',
      inputSchema: {
        project_id: z.string().describe('projects.id'),
        name: z.string().min(1).describe('Team display name'),
      },
    },
    async (params) => {
      const dl = await fetchDownloadJson(ctx);
      if (dl.ok === false) return toolErr(`download failed (${dl.status}): ${dl.text}`);
      const parsed = parseBackupTables(dl.data);
      if (!parsed) return toolErr('invalid backup shape');
      if (!projectExists(parsed.tables, params.project_id)) {
        return toolErr(`project not found: ${params.project_id}`);
      }
      const id = `t-mcp-${Date.now()}-${randomBytes(3).toString('hex')}`;
      const sort_order = maxSortOrderForProjectTeams(parsed.tables, params.project_id) + 1;
      const row = {
        id,
        project_id: params.project_id,
        name: params.name.trim(),
        sort_order,
      };
      const patch = await fetchPatch(ctx, {
        base_version: parsed.version,
        ops: [{ op: 'insert', table: 'project_teams', row }],
      });
      if (patch.ok === false) return toolErr(`patch failed (${patch.status}): ${patch.text}`);
      const body = patch.data as Record<string, unknown>;
      return toolJson({ ok: body.ok ?? true, version: body.version, id });
    },
  );

  server.registerTool(
    'create_topic',
    {
      description: 'Insert a project_topics row under an existing project_teams row (main topic / column header).',
      inputSchema: {
        team_id: z.string().describe('project_teams.id'),
        title: z.string().min(1).describe('Topic title'),
      },
    },
    async (params) => {
      const dl = await fetchDownloadJson(ctx);
      if (dl.ok === false) return toolErr(`download failed (${dl.status}): ${dl.text}`);
      const parsed = parseBackupTables(dl.data);
      if (!parsed) return toolErr('invalid backup shape');
      if (!teamExists(parsed.tables, params.team_id)) {
        return toolErr(`team not found: ${params.team_id}`);
      }
      const id = `top-mcp-${Date.now()}-${randomBytes(3).toString('hex')}`;
      const sort_order = maxSortOrderForTeamTopics(parsed.tables, params.team_id) + 1;
      const row = {
        id,
        team_id: params.team_id,
        title: params.title.trim(),
        sort_order,
      };
      const patch = await fetchPatch(ctx, {
        base_version: parsed.version,
        ops: [{ op: 'insert', table: 'project_topics', row }],
      });
      if (patch.ok === false) return toolErr(`patch failed (${patch.status}): ${patch.text}`);
      const body = patch.data as Record<string, unknown>;
      return toolJson({ ok: body.ok ?? true, version: body.version, id });
    },
  );

  server.registerTool(
    'create_cap',
    {
      description:
        'Create a capability group (insert caps + capability_order), like adding a CAP column on the capability board.',
      inputSchema: {
        name: z.string().min(1).describe('CAP display name'),
        id: z
          .string()
          .optional()
          .describe('Optional caps.id; default derived from name (nameToId) with unique suffix if taken'),
        cols: z.union([z.literal(12), z.literal(6), z.literal(4), z.literal(3)]).nullable().optional(),
        rows: z.number().int().positive().nullable().optional().describe('Optional row count for board layout'),
      },
    },
    async (params) => {
      const dl = await fetchDownloadJson(ctx);
      if (dl.ok === false) return toolErr(`download failed (${dl.status}): ${dl.text}`);
      const parsed = parseBackupTables(dl.data);
      if (!parsed) return toolErr('invalid backup shape');
      const displayName = params.name.trim();
      let id: string;
      if (params.id !== undefined && params.id.trim() !== '') {
        id = sanitizeId(params.id.trim()) || 'cap';
        if (capExists(parsed.tables, id)) {
          return toolErr(`cap id already exists: ${id}`);
        }
      } else {
        const base = sanitizeId(nameToId(displayName)) || 'cap';
        id = ensureUniqueId(base, allCapIds(parsed.tables));
      }
      const sort_order = maxCapabilityOrderSort(parsed.tables) + 1;
      const capsRow = {
        id,
        name: displayName,
        cols: params.cols ?? null,
        rows: params.rows ?? null,
      };
      const orderRow = { sort_order, cap_id: id };
      const patch = await fetchPatch(ctx, {
        base_version: parsed.version,
        ops: [
          { op: 'insert', table: 'caps', row: capsRow },
          { op: 'insert', table: 'capability_order', row: orderRow },
        ],
      });
      if (patch.ok === false) return toolErr(`patch failed (${patch.status}): ${patch.text}`);
      const body = patch.data as Record<string, unknown>;
      return toolJson({ ok: body.ok ?? true, version: body.version, id });
    },
  );

  server.registerTool(
    'add_project_to_cap',
    {
      description:
        'Link an existing project to a capability group (cap_projects row). Optional status/cols match the capability board cards.',
      inputSchema: {
        cap_id: z.string().describe('caps.id'),
        project_id: z.string().describe('projects.id'),
        status: z.enum(['RED', 'YELLOW', 'GREEN']).nullable().optional(),
        cols: z.union([z.literal(12), z.literal(6), z.literal(4), z.literal(3)]).nullable().optional(),
      },
    },
    async (params) => {
      const dl = await fetchDownloadJson(ctx);
      if (dl.ok === false) return toolErr(`download failed (${dl.status}): ${dl.text}`);
      const parsed = parseBackupTables(dl.data);
      if (!parsed) return toolErr('invalid backup shape');
      if (!capExists(parsed.tables, params.cap_id)) {
        return toolErr(`cap not found: ${params.cap_id}`);
      }
      if (!projectExists(parsed.tables, params.project_id)) {
        return toolErr(`project not found: ${params.project_id}`);
      }
      if (capProjectLinkExists(parsed.tables, params.cap_id, params.project_id)) {
        return toolErr(`project already linked to this cap: ${params.project_id}`);
      }
      const sort_order = maxSortOrderCapProjects(parsed.tables, params.cap_id) + 1;
      const row = {
        cap_id: params.cap_id,
        project_id: params.project_id,
        status: params.status ?? null,
        cols: params.cols ?? null,
        sort_order,
      };
      const patch = await fetchPatch(ctx, {
        base_version: parsed.version,
        ops: [{ op: 'insert', table: 'cap_projects', row }],
      });
      if (patch.ok === false) return toolErr(`patch failed (${patch.status}): ${patch.text}`);
      const body = patch.data as Record<string, unknown>;
      return toolJson({ ok: body.ok ?? true, version: body.version });
    },
  );

  server.registerTool(
    'create_org_team',
    {
      description:
        'Create an org team row (org_teams) for the team hierarchy / picker. Does not add org_team_children links; use the app or future tools for parent/child ordering.',
      inputSchema: {
        name: z.string().min(1).describe('Team name'),
        id: z
          .string()
          .optional()
          .describe('Optional org_teams.id; default from name (nameToId) with unique suffix if taken'),
        owner: z.string().optional().describe('Owner label; default empty'),
        parent_id: z.string().nullable().optional().describe('Parent org team id, or null for root'),
      },
    },
    async (params) => {
      const dl = await fetchDownloadJson(ctx);
      if (dl.ok === false) return toolErr(`download failed (${dl.status}): ${dl.text}`);
      const parsed = parseBackupTables(dl.data);
      if (!parsed) return toolErr('invalid backup shape');
      const displayName = params.name.trim();
      let id: string;
      if (params.id !== undefined && params.id.trim() !== '') {
        id = sanitizeId(params.id.trim()) || 'team';
        if (orgTeamExists(parsed.tables, id)) {
          return toolErr(`org team id already exists: ${id}`);
        }
      } else {
        const base = sanitizeId(nameToId(displayName)) || 'team';
        id = ensureUniqueId(base, allOrgTeamIds(parsed.tables));
      }
      const parent_id = params.parent_id === undefined ? null : params.parent_id;
      if (parent_id !== null && parent_id !== undefined && parent_id !== '') {
        if (!orgTeamExists(parsed.tables, parent_id)) {
          return toolErr(`parent org team not found: ${parent_id}`);
        }
      }
      const row = {
        id,
        name: displayName,
        owner: params.owner ?? '',
        parent_id: parent_id && parent_id !== '' ? parent_id : null,
      };
      const patch = await fetchPatch(ctx, {
        base_version: parsed.version,
        ops: [{ op: 'insert', table: 'org_teams', row }],
      });
      if (patch.ok === false) return toolErr(`patch failed (${patch.status}): ${patch.text}`);
      const body = patch.data as Record<string, unknown>;
      return toolJson({ ok: body.ok ?? true, version: body.version, id });
    },
  );

  server.registerTool(
    'update_project',
    {
      description: 'Update projects row (name, description) via PATCH sync update.',
      inputSchema: {
        id: z.string().describe('projects.id'),
        name: z.string().optional(),
        description: z.string().nullable().optional().describe('Set null to clear'),
      },
    },
    async (params) => {
      if (params.name === undefined && params.description === undefined) {
        return toolErr('at least one of name, description is required');
      }
      const dl = await fetchDownloadJson(ctx);
      if (dl.ok === false) return toolErr(`download failed (${dl.status}): ${dl.text}`);
      const parsed = parseBackupTables(dl.data);
      if (!parsed) return toolErr('invalid backup shape');
      if (!projectExists(parsed.tables, params.id)) {
        return toolErr(`project not found: ${params.id}`);
      }
      const fields: Record<string, unknown> = {};
      const field_updated_at: Record<string, string> = {};
      const now = new Date().toISOString();
      if (params.name !== undefined) {
        fields.name = params.name;
        field_updated_at.name = now;
      }
      if (params.description !== undefined) {
        fields.description = params.description;
        field_updated_at.description = now;
      }
      const patch = await fetchPatch(ctx, {
        base_version: parsed.version,
        ops: [{ op: 'update', table: 'projects', id: params.id, fields, field_updated_at }],
      });
      if (patch.ok === false) return toolErr(`patch failed (${patch.status}): ${patch.text}`);
      const body = patch.data as Record<string, unknown>;
      return toolJson({ ok: body.ok ?? true, version: body.version });
    },
  );

  server.registerTool(
    'update_topic',
    {
      description: 'Update project_topics row (title, sort_order).',
      inputSchema: {
        id: z.string().describe('project_topics.id'),
        title: z.string().optional(),
        sort_order: z.number().int().optional(),
      },
    },
    async (params) => {
      if (params.title === undefined && params.sort_order === undefined) {
        return toolErr('at least one of title, sort_order is required');
      }
      const dl = await fetchDownloadJson(ctx);
      if (dl.ok === false) return toolErr(`download failed (${dl.status}): ${dl.text}`);
      const parsed = parseBackupTables(dl.data);
      if (!parsed) return toolErr('invalid backup shape');
      if (!topicExists(parsed.tables, params.id)) {
        return toolErr(`topic not found: ${params.id}`);
      }
      const fields: Record<string, unknown> = {};
      const field_updated_at: Record<string, string> = {};
      const now = new Date().toISOString();
      if (params.title !== undefined) {
        fields.title = params.title;
        field_updated_at.title = now;
      }
      if (params.sort_order !== undefined) {
        fields.sort_order = params.sort_order;
        field_updated_at.sort_order = now;
      }
      const patch = await fetchPatch(ctx, {
        base_version: parsed.version,
        ops: [{ op: 'update', table: 'project_topics', id: params.id, fields, field_updated_at }],
      });
      if (patch.ok === false) return toolErr(`patch failed (${patch.status}): ${patch.text}`);
      const body = patch.data as Record<string, unknown>;
      return toolJson({ ok: body.ok ?? true, version: body.version });
    },
  );

  server.registerTool(
    'update_sub_topic',
    {
      description: 'Update project_sub_topics row (title, status, sub_topic_type, sort_order).',
      inputSchema: {
        id: z.string().describe('project_sub_topics.id'),
        title: z.string().optional(),
        status: z.enum(['GREEN', 'YELLOW', 'RED']).optional(),
        sub_topic_type: z.enum(['todos', 'status']).optional(),
        sort_order: z.number().int().optional(),
      },
    },
    async (params) => {
      if (
        params.title === undefined &&
        params.status === undefined &&
        params.sub_topic_type === undefined &&
        params.sort_order === undefined
      ) {
        return toolErr('at least one of title, status, sub_topic_type, sort_order is required');
      }
      const dl = await fetchDownloadJson(ctx);
      if (dl.ok === false) return toolErr(`download failed (${dl.status}): ${dl.text}`);
      const parsed = parseBackupTables(dl.data);
      if (!parsed) return toolErr('invalid backup shape');
      if (!subTopicExists(parsed.tables, params.id)) {
        return toolErr(`sub_topic not found: ${params.id}`);
      }
      const fields: Record<string, unknown> = {};
      const field_updated_at: Record<string, string> = {};
      const now = new Date().toISOString();
      if (params.title !== undefined) {
        fields.title = params.title;
        field_updated_at.title = now;
      }
      if (params.status !== undefined) {
        fields.status = params.status;
        field_updated_at.status = now;
      }
      if (params.sub_topic_type !== undefined) {
        fields.sub_topic_type = params.sub_topic_type;
        field_updated_at.sub_topic_type = now;
      }
      if (params.sort_order !== undefined) {
        fields.sort_order = params.sort_order;
        field_updated_at.sort_order = now;
      }
      const patch = await fetchPatch(ctx, {
        base_version: parsed.version,
        ops: [{ op: 'update', table: 'project_sub_topics', id: params.id, fields, field_updated_at }],
      });
      if (patch.ok === false) return toolErr(`patch failed (${patch.status}): ${patch.text}`);
      const body = patch.data as Record<string, unknown>;
      return toolJson({ ok: body.ok ?? true, version: body.version });
    },
  );

  server.registerTool(
    'delete_task',
    {
      description: 'Delete one project_sub_topic_details row (task) by id.',
      inputSchema: {
        id: z.string().describe('project_sub_topic_details id'),
      },
    },
    async ({ id }) => {
      const dl = await fetchDownloadJson(ctx);
      if (dl.ok === false) return toolErr(`download failed (${dl.status}): ${dl.text}`);
      const parsed = parseBackupTables(dl.data);
      if (!parsed) return toolErr('invalid backup shape');
      const ops = buildDeleteTaskOps(parsed.tables, id);
      if (!ops) return toolErr(`task not found: ${id}`);
      const applied = await applyPatchOpsBatches(ctx, parsed.version, ops);
      if (applied.ok === false) return toolErr(`patch failed (${applied.status}): ${applied.text}`);
      return toolJson({ ok: true, version: applied.version, deleted: 1, patch_batches: applied.batches });
    },
  );

  server.registerTool(
    'delete_sub_topic',
    {
      description:
        'Delete a project_sub_topics row and all nested project_sub_topic_details (cascade).',
      inputSchema: {
        id: z.string().describe('project_sub_topics id'),
      },
    },
    async ({ id }) => {
      const dl = await fetchDownloadJson(ctx);
      if (dl.ok === false) return toolErr(`download failed (${dl.status}): ${dl.text}`);
      const parsed = parseBackupTables(dl.data);
      if (!parsed) return toolErr('invalid backup shape');
      const ops = buildDeleteSubTopicOps(parsed.tables, id);
      if (!ops) return toolErr(`sub_topic not found: ${id}`);
      const applied = await applyPatchOpsBatches(ctx, parsed.version, ops);
      if (applied.ok === false) return toolErr(`patch failed (${applied.status}): ${applied.text}`);
      return toolJson({ ok: true, version: applied.version, ops_applied: ops.length, patch_batches: applied.batches });
    },
  );

  server.registerTool(
    'delete_topic',
    {
      description:
        'Delete a project_topics row and all nested sub-topics and tasks (cascade).',
      inputSchema: {
        id: z.string().describe('project_topics id'),
      },
    },
    async ({ id }) => {
      const dl = await fetchDownloadJson(ctx);
      if (dl.ok === false) return toolErr(`download failed (${dl.status}): ${dl.text}`);
      const parsed = parseBackupTables(dl.data);
      if (!parsed) return toolErr('invalid backup shape');
      const ops = buildDeleteTopicOps(parsed.tables, id);
      if (!ops) return toolErr(`topic not found: ${id}`);
      const applied = await applyPatchOpsBatches(ctx, parsed.version, ops);
      if (applied.ok === false) return toolErr(`patch failed (${applied.status}): ${applied.text}`);
      return toolJson({ ok: true, version: applied.version, ops_applied: ops.length, patch_batches: applied.batches });
    },
  );

  server.registerTool(
    'delete_project',
    {
      description:
        'Delete a project: cascades teams, topics, sub-topics, tasks, and cap_projects links, then projects row.',
      inputSchema: {
        id: z.string().describe('projects id'),
      },
    },
    async ({ id }) => {
      const dl = await fetchDownloadJson(ctx);
      if (dl.ok === false) return toolErr(`download failed (${dl.status}): ${dl.text}`);
      const parsed = parseBackupTables(dl.data);
      if (!parsed) return toolErr('invalid backup shape');
      const ops = buildDeleteProjectOps(parsed.tables, id);
      if (!ops) return toolErr(`project not found: ${id}`);
      const applied = await applyPatchOpsBatches(ctx, parsed.version, ops);
      if (applied.ok === false) return toolErr(`patch failed (${applied.status}): ${applied.text}`);
      return toolJson({ ok: true, version: applied.version, ops_applied: ops.length, patch_batches: applied.batches });
    },
  );

  server.registerTool(
    'undo_last',
    {
      description: 'Undo one sync PATCH batch using audit request id (POST /api/audit/undo/:req_id).',
      inputSchema: {
        req_id: z.string().describe('Audit request id from PATCH response or audit log'),
      },
    },
    async ({ req_id }) => {
      const u = await fetchUndo(ctx, req_id);
      if (u.ok === false) return toolErr(`undo failed (${u.status}): ${u.text}`);
      const body = u.data as Record<string, unknown>;
      return toolJson({ ok: body.ok ?? true, version: body.version, reversed: body.reversed });
    },
  );

  server.registerTool(
    'create_weekly_snapshot',
    {
      description:
        'Take an EA weekly snapshot for a project (POST /api/ea/:projectId/snapshot). Requires week definitions (PUT weeks) and write token scope.',
      inputSchema: {
        project_id: z.string().min(1).describe('Project id (same as projects.id in backup)'),
        week_no: z.number().int().positive().describe('Week number as defined in PUT .../weeks'),
      },
    },
    async ({ project_id, week_no }) => {
      const pid = encodeURIComponent(project_id);
      const r = await fetchEaJson(ctx, 'POST', `/api/ea/${pid}/snapshot`, { week_no });
      if (r.ok === false) return toolErr(`create_weekly_snapshot failed (${r.status}): ${r.text}`);
      return toolJson(r.data);
    },
  );

  server.registerTool(
    'get_weekly_history',
    {
      description:
        'Get EA weekly snapshot history (GET /api/ea/:projectId/history) or one week (GET .../history/:week_no when week_no set).',
      inputSchema: {
        project_id: z.string().min(1).describe('Project id'),
        week_no: z.number().int().positive().optional().describe('If set, return only this week (latest snapshot file for that week)'),
      },
    },
    async ({ project_id, week_no }) => {
      const pid = encodeURIComponent(project_id);
      const path =
        week_no !== undefined && week_no !== null
          ? `/api/ea/${pid}/history/${encodeURIComponent(String(week_no))}`
          : `/api/ea/${pid}/history`;
      const r = await fetchEaJson(ctx, 'GET', path);
      if (r.ok === false) return toolErr(`get_weekly_history failed (${r.status}): ${r.text}`);
      return toolJson(r.data);
    },
  );

  return server;
}
