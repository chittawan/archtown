/**
 * Domain repository: Capability (capability_order + caps + cap_projects).
 * Frontend pages call this.
 */
import type { CapabilityLayout, Cap, ProjectInCap } from '../../lib/capabilityYaml';
import * as client from '../client';
import * as capabilityOrderTable from './capability_order.repository';
import type { CapProjectRow } from './cap_projects.repository';
import * as capsTable from './caps.repository';
import * as capProjectsTable from './cap_projects.repository';
import * as projectRepo from './project.repository';
import { enqueuePatchDelete, enqueuePatchDeleteComposite, enqueuePatchInsert, enqueuePatchUpdate } from '../pendingSyncOps';

export async function getCapabilityLayout(): Promise<{ layout: CapabilityLayout }> {
  const orderRows = await capabilityOrderTable.getAll();
  const capOrder = orderRows.map((r) => r.cap_id);
  const caps: Record<string, Cap> = {};
  for (const capId of capOrder) {
    const c = await capsTable.getById(capId);
    const projRows = await capProjectsTable.getByCapId(capId);
    const projects: ProjectInCap[] = projRows.map((p) => ({
      id: p.project_id,
      status: (p.status === 'RED' || p.status === 'YELLOW' || p.status === 'GREEN' ? p.status : undefined) as ProjectInCap['status'],
      cols: (p.cols === 12 || p.cols === 6 || p.cols === 4 || p.cols === 3 ? p.cols : undefined) as ProjectInCap['cols'],
    }));
    caps[capId] = {
      id: capId,
      name: c?.name ?? capId,
      cols: (c?.cols === 12 || c?.cols === 6 || c?.cols === 4 || c?.cols === 3 ? c.cols : undefined) as Cap['cols'],
      rows: c?.rows ?? undefined,
      projects,
    };
  }
  return { layout: { capOrder, caps } };
}

export async function saveCapabilityLayout(layout: CapabilityLayout): Promise<{ ok: boolean }> {
  const existingOrder = await capabilityOrderTable.getAll();
  const existingCapProjects =
    (
      await client.exec<CapProjectRow>(
        `SELECT cap_id, project_id, status, cols, sort_order FROM cap_projects ORDER BY cap_id, sort_order, project_id`
      )
    ).resultRows ?? [];

  // phase2_3_1: enqueue PATCH ops for caps (single PK)
  const existingCaps = (
    await client.exec<{ id: string; name: string; cols: number | null; rows: number | null }>(
      `SELECT id, name, cols, rows FROM caps ORDER BY id`
    )
  ).resultRows ?? [];
  const existingCapsById = new Map(existingCaps.map((r) => [r.id, r]));

  const nextCapsRows: Array<{ id: string; name: string; cols: number | null; rows: number | null }> = [];
  for (const capId of layout.capOrder ?? []) {
    const cap = layout.caps?.[capId];
    nextCapsRows.push({
      id: capId,
      name: cap?.name ?? capId,
      cols: cap?.cols ?? null,
      rows: cap?.rows ?? null,
    });
  }
  const nextCapsById = new Map(nextCapsRows.map((r) => [r.id, r]));

  const deleteCapIds = existingCaps.filter((c) => !nextCapsById.has(c.id)).map((c) => c.id);
  const insertCapRows = nextCapsRows.filter((c) => !existingCapsById.has(c.id));
  const updateCaps = nextCapsRows
    .filter((c) => existingCapsById.has(c.id))
    .map((c) => {
      const prev = existingCapsById.get(c.id)!;
      const fields: Record<string, unknown> = {};
      if (prev.name !== c.name) fields.name = c.name;
      if (prev.cols !== c.cols) fields.cols = c.cols;
      if (prev.rows !== c.rows) fields.rows = c.rows;
      return { id: c.id, fields };
    })
    .filter((x) => Object.keys(x.fields).length > 0);

  const nextOrderRows: Array<{ sort_order: number; cap_id: string }> = [];
  let ord = 0;
  for (const capId of layout.capOrder ?? []) {
    nextOrderRows.push({ sort_order: ord++, cap_id: capId });
  }

  const nextCapProjectRows: CapProjectRow[] = [];
  for (const capId of layout.capOrder ?? []) {
    const cap = layout.caps?.[capId];
    if (!cap) continue;
    let po = 0;
    for (const proj of cap.projects ?? []) {
      nextCapProjectRows.push({
        cap_id: capId,
        project_id: proj.id,
        status: proj.status ?? null,
        cols: proj.cols ?? null,
        sort_order: po++,
      });
    }
  }

  const orderKey = (r: { sort_order: number; cap_id: string }) => `${r.sort_order}|${r.cap_id}`;
  const projKey = (r: CapProjectRow) => `${r.cap_id}|${r.project_id}`;

  const oldOrderByKey = new Map(existingOrder.map((r) => [orderKey(r), r]));
  const newOrderByKey = new Map(nextOrderRows.map((r) => [orderKey(r), r]));

  const oldProjByKey = new Map(existingCapProjects.map((r) => [projKey(r), r]));
  const newProjByKey = new Map(nextCapProjectRows.map((r) => [projKey(r), r]));

  const capProjectDeletes: Array<{ cap_id: string; project_id: string }> = [];
  const capProjectInserts: CapProjectRow[] = [];
  for (const [k, o] of oldProjByKey) {
    const n = newProjByKey.get(k);
    if (!n) capProjectDeletes.push({ cap_id: o.cap_id, project_id: o.project_id });
    else if (n.sort_order !== o.sort_order || n.status !== o.status || n.cols !== o.cols) {
      capProjectDeletes.push({ cap_id: o.cap_id, project_id: o.project_id });
      capProjectInserts.push(n);
    }
  }
  for (const [, n] of newProjByKey) {
    if (!oldProjByKey.has(projKey(n))) capProjectInserts.push(n);
  }

  const orderDeletes: Array<{ sort_order: number; cap_id: string }> = [];
  const orderInserts: Array<{ sort_order: number; cap_id: string }> = [];
  for (const [k, o] of oldOrderByKey) {
    if (!newOrderByKey.has(k)) orderDeletes.push({ sort_order: o.sort_order, cap_id: o.cap_id });
  }
  for (const [k, n] of newOrderByKey) {
    if (!oldOrderByKey.has(k)) orderInserts.push(n);
  }

  await client.runInTransaction(async () => {
    await capabilityOrderTable.deleteAll();
    await capProjectsTable.deleteAll();
    await capsTable.deleteAll();
    let sortOrder = 0;
    for (const capId of layout.capOrder ?? []) {
      await capabilityOrderTable.insert({ sort_order: sortOrder++, cap_id: capId });
      const cap = layout.caps?.[capId];
      if (cap) {
        await capsTable.insert({
          id: capId,
          name: cap.name ?? capId,
          cols: cap.cols ?? null,
          rows: cap.rows ?? null,
        });
        let projOrder = 0;
        for (const proj of cap.projects ?? []) {
          await capProjectsTable.insert({
            cap_id: capId,
            project_id: proj.id,
            status: proj.status ?? null,
            cols: proj.cols ?? null,
            sort_order: projOrder++,
          });
        }
      }
    }
  });

  // enqueue after SQLite transaction success
  const ts = new Date().toISOString();
  for (const d of capProjectDeletes) {
    enqueuePatchDeleteComposite('cap_projects', { cap_id: d.cap_id, project_id: d.project_id });
  }
  for (const d of orderDeletes) {
    enqueuePatchDeleteComposite('capability_order', { sort_order: d.sort_order, cap_id: d.cap_id });
  }
  for (const r of orderInserts) {
    enqueuePatchInsert('capability_order', { sort_order: r.sort_order, cap_id: r.cap_id });
  }
  for (const r of capProjectInserts) {
    enqueuePatchInsert('cap_projects', {
      cap_id: r.cap_id,
      project_id: r.project_id,
      status: r.status,
      cols: r.cols,
      sort_order: r.sort_order,
    });
  }

  for (const id of deleteCapIds) enqueuePatchDelete('caps', id);
  for (const row of insertCapRows) enqueuePatchInsert('caps', row);
  for (const u of updateCaps) enqueuePatchUpdate('caps', u.id, u.fields, ts);

  return { ok: true };
}

export async function getCapabilitySummary(projectId?: string): Promise<{
  critical: Array<{ capName: string; projectName: string; taskName: string }>;
  warning: Array<{ capName: string; projectName: string; taskName: string }>;
}> {
  const critical: Array<{ capName: string; projectName: string; taskName: string }> = [];
  const warning: Array<{ capName: string; projectName: string; taskName: string }> = [];
  const { layout } = await getCapabilityLayout();
  for (const capId of layout.capOrder) {
    const cap = layout.caps[capId];
    if (!cap) continue;
    const capName = cap.name ?? capId;
    for (const proj of cap.projects ?? []) {
      if (projectId && proj.id !== projectId) continue;
      const projData = await projectRepo.getProject(proj.id);
      if (!projData) continue;
      const projectName = projData.data.projectName ?? proj.id;
      for (const team of projData.data.teams ?? []) {
        for (const topic of team.topics ?? []) {
          for (const sub of topic.subTopics ?? []) {
            if (sub.status === 'RED') critical.push({ capName, projectName, taskName: sub.title });
            else if (sub.status === 'YELLOW') warning.push({ capName, projectName, taskName: sub.title });
          }
        }
      }
    }
  }
  return { critical, warning };
}
