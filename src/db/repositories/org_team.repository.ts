/**
 * Domain repository: Org Team (org_teams + org_team_children).
 * Frontend pages call this.
 */
import type { OrgTeam } from '../../types';
import { sanitizeId } from '../../lib/idUtils';
import * as orgTeamsTable from './org_teams.repository';
import * as orgTeamChildrenTable from './org_team_children.repository';

export async function listTeamIds(): Promise<{ ids: string[] }> {
  const rows = await orgTeamsTable.getAll();
  return { ids: rows.map((r) => r.id) };
}

export async function getTeam(id: string): Promise<{ id: string; data: OrgTeam } | null> {
  const safeId = sanitizeId(id) || 'team';
  const row = await orgTeamsTable.getById(safeId);
  if (!row) return null;
  const childRows = await orgTeamChildrenTable.getByParentId(safeId);
  const childIds = childRows.map((c) => c.child_id);
  return {
    id: safeId,
    data: {
      id: safeId,
      name: row.name ?? 'Team',
      owner: row.owner ?? '',
      parentId: row.parent_id ?? null,
      childIds,
    },
  };
}

export async function saveTeam(id: string, data: OrgTeam): Promise<{ ok: boolean; id: string }> {
  const safeId = sanitizeId(id) || sanitizeId(data.id) || 'team';
  await orgTeamsTable.replace({
    id: safeId,
    name: data.name ?? 'Team',
    owner: data.owner ?? '',
    parent_id: data.parentId ?? null,
  });
  await orgTeamChildrenTable.deleteByParentId(safeId);
  let order = 0;
  for (const cid of data.childIds ?? []) {
    await orgTeamChildrenTable.insert({ parent_id: safeId, child_id: cid, sort_order: order++ });
  }
  return { ok: true, id: safeId };
}
