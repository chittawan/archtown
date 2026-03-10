/**
 * Cability (Cab + order) as YAML. Used by server to read/write data/cability/*.yaml.
 */
import yaml from 'js-yaml';
import type { Cab, ProjectInCab, ProjectStatus } from './cabilityMarkdown';

const COLS = [12, 6, 4, 3] as const;
type Cols = (typeof COLS)[number];

function safeId(s: string): string {
  return s.replace(/[^a-zA-Z0-9-_]/g, '') || 'cab';
}

function isCols(n: unknown): n is Cols {
  return typeof n === 'number' && (n === 12 || n === 6 || n === 4 || n === 3);
}

function isStatus(s: unknown): s is ProjectStatus {
  return s === 'RED' || s === 'YELLOW' || s === 'GREEN';
}

interface ProjectInCabYaml {
  id: string;
  name: string;
  status?: string;
  cols?: number;
}

interface CabYamlRoot {
  id?: string;
  name: string;
  cols?: number;
  projects?: ProjectInCabYaml[];
}

/** Parse YAML string into Cab; id มาจาก filename แต่ถ้ามีใน YAML จะใช้เป็นหลัก */
export function yamlToCab(id: string, yamlStr: string): Cab {
  const raw = yaml.load(yamlStr) as CabYamlRoot | null;
  if (!raw || typeof raw !== 'object') {
    return { id: safeId(id), name: 'Cab', projects: [] };
  }
  const cabId =
    typeof raw.id === 'string' && raw.id.trim() ? safeId(raw.id.trim()) : safeId(id);
  const name = typeof raw.name === 'string' ? raw.name.trim() : 'Cab';
  const cols = isCols(raw.cols) ? raw.cols : undefined;
  const projects: ProjectInCab[] = [];
  const list = Array.isArray(raw.projects) ? raw.projects : [];
  for (const p of list) {
    const projectId = typeof p.id === 'string' ? p.id.trim() : '';
    if (!projectId) continue;
    const projectName = typeof p.name === 'string' ? p.name.trim() : projectId;
    const status = isStatus(p.status) ? p.status : undefined;
    const projCols = isCols(p.cols) ? p.cols : undefined;
    projects.push({ id: projectId, name: projectName, status, cols: projCols });
  }
  return { id: cabId, name, cols, projects };
}

/** Serialize Cab to YAML */
export function cabToYaml(cab: Cab): string {
  const root: CabYamlRoot = {
    id: cab.id,
    name: cab.name || 'Cab',
    cols: cab.cols,
    projects:
      cab.projects.length > 0
        ? cab.projects.map((p) => ({
            id: p.id,
            name: p.name,
            ...(p.status && { status: p.status }),
            ...(p.cols != null && { cols: p.cols }),
          }))
        : undefined,
  };
  return yaml.dump(root, { lineWidth: -1, noRefs: true });
}

/** Parse _order.yaml (array of cab ids) */
export function yamlToCabOrder(yamlStr: string): string[] {
  const raw = yaml.load(yamlStr);
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x).trim()).filter(Boolean);
}

/** Serialize cab order to YAML */
export function cabOrderToYaml(cabOrder: string[]): string {
  const list = cabOrder.filter(Boolean);
  return yaml.dump(list, { lineWidth: -1, noRefs: true });
}
