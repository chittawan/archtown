/**
 * Team (OrgTeam) as YAML. Used by server to read/write data/teams/*.yaml.
 * Team id = filename, so not stored in YAML.
 */
import yaml from 'js-yaml';
import type { OrgTeam } from '../types';

interface TeamYamlRoot {
  id?: string;
  name: string;
  owner?: string;
  parent?: string | null;
  childIds?: string[];
}

/** Parse YAML string into OrgTeam; id comes from filename */
export function yamlToOrgTeam(id: string, yamlStr: string): OrgTeam {
  const raw = yaml.load(yamlStr) as TeamYamlRoot | null;
  if (!raw || typeof raw !== 'object') {
    return { id, name: 'Team', owner: '', parentId: null, childIds: [] };
  }
  const name = typeof raw.name === 'string' ? raw.name.trim() : 'Team';
  const owner = typeof raw.owner === 'string' ? raw.owner.trim() : '';
  let parentId: string | null = null;
  if (raw.parent != null && raw.parent !== '') {
    parentId = String(raw.parent).trim() || null;
  }
  const childIds = Array.isArray(raw.childIds)
    ? raw.childIds.map((c) => String(c).trim()).filter(Boolean)
    : [];
  return { id, name, owner, parentId, childIds };
}

/** Serialize OrgTeam to YAML; id ใช้เชื่อมกับ filename */
export function orgTeamToYaml(team: OrgTeam): string {
  const root: TeamYamlRoot = {
    ...(team.id && { id: team.id }),
    name: team.name || 'Team',
    owner: team.owner || '',
    parent: team.parentId ?? null,
    childIds: team.childIds.length > 0 ? team.childIds : undefined,
  };
  return yaml.dump(root, { lineWidth: -1, noRefs: true });
}
