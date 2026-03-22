import { randomBytes } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { nameToId, sanitizeId } from '../../src/lib/idUtils';
import { fetchDownloadJson, fetchPatch, fetchUndo } from './archtownApi';
import {
  aggregateProjects,
  detailExists,
  listTasksFiltered,
  maxSortOrderForSubTopic,
  maxSortOrderForTopic,
  parseBackupTables,
  projectExists,
  subTopicExists,
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

  return server;
}
