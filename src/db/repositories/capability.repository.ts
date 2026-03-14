/**
 * Domain repository: Capability (capability_order + caps + cap_projects).
 * Frontend pages call this.
 */
import type { CapabilityLayout, Cap, ProjectInCap } from '../../lib/capabilityYaml';
import * as client from '../client';
import * as capabilityOrderTable from './capability_order.repository';
import * as capsTable from './caps.repository';
import * as capProjectsTable from './cap_projects.repository';
import * as projectRepo from './project.repository';

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
