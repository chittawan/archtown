/**
 * Capability (Cap + order) as YAML. Used by server to read/write data/capability/*.yaml.
 * Types Cap, ProjectInCap, CapabilityLayout are shared with UI.
 */
import yaml from 'js-yaml';

export type ProjectStatus = 'RED' | 'YELLOW' | 'GREEN';

export interface ProjectInCap {
  id: string;
  name: string;
  status?: ProjectStatus;
  cols?: 12 | 6 | 4 | 3;
}

export interface Cap {
  id: string;
  name: string;
  cols?: 12 | 6 | 4 | 3;
  projects: ProjectInCap[];
}

export interface CapabilityLayout {
  capOrder: string[];
  caps: Record<string, Cap>;
}

const COLS = [12, 6, 4, 3] as const;
type Cols = (typeof COLS)[number];

function safeId(s: string): string {
  return s.replace(/[^a-zA-Z0-9-_]/g, '') || 'cap';
}

function isCols(n: unknown): n is Cols {
  return typeof n === 'number' && (n === 12 || n === 6 || n === 4 || n === 3);
}

function isStatus(s: unknown): s is ProjectStatus {
  return s === 'RED' || s === 'YELLOW' || s === 'GREEN';
}

interface ProjectInCapYaml {
  id: string;
  name: string;
  status?: string;
  cols?: number;
}

interface CapYamlRoot {
  id?: string;
  name: string;
  cols?: number;
  projects?: ProjectInCapYaml[];
}

/** Parse YAML string into Cap; id มาจาก filename แต่ถ้ามีใน YAML จะใช้เป็นหลัก */
export function yamlToCap(id: string, yamlStr: string): Cap {
  const raw = yaml.load(yamlStr) as CapYamlRoot | null;
  if (!raw || typeof raw !== 'object') {
    return { id: safeId(id), name: 'Cap', projects: [] };
  }
  const capId =
    typeof raw.id === 'string' && raw.id.trim() ? safeId(raw.id.trim()) : safeId(id);
  const name = typeof raw.name === 'string' ? raw.name.trim() : 'Cap';
  const cols = isCols(raw.cols) ? raw.cols : undefined;
  const projects: ProjectInCap[] = [];
  const list = Array.isArray(raw.projects) ? raw.projects : [];
  for (const p of list) {
    const projectId = typeof p.id === 'string' ? p.id.trim() : '';
    if (!projectId) continue;
    const projectName = typeof p.name === 'string' ? p.name.trim() : projectId;
    const status = isStatus(p.status) ? p.status : undefined;
    const projCols = isCols(p.cols) ? p.cols : undefined;
    projects.push({ id: projectId, name: projectName, status, cols: projCols });
  }
  return { id: capId, name, cols, projects };
}

/** Serialize Cap to YAML */
export function capToYaml(cap: Cap): string {
  const root: CapYamlRoot = {
    id: cap.id,
    name: cap.name || 'Cap',
    cols: cap.cols,
    projects:
      cap.projects.length > 0
        ? cap.projects.map((p) => ({
            id: p.id,
            name: p.name,
            ...(p.status && { status: p.status }),
            ...(p.cols != null && { cols: p.cols }),
          }))
        : undefined,
  };
  return yaml.dump(root, { lineWidth: -1, noRefs: true });
}

/** Parse _order.yaml (array of cap ids) */
export function yamlToCapOrder(yamlStr: string): string[] {
  const raw = yaml.load(yamlStr);
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x).trim()).filter(Boolean);
}

/** Serialize cap order to YAML */
export function capOrderToYaml(capOrder: string[]): string {
  const list = capOrder.filter(Boolean);
  return yaml.dump(list, { lineWidth: -1, noRefs: true });
}
