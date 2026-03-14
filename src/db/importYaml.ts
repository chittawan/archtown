/**
 * Import YAML files into SQLite WASM DB.
 * User selects multiple .yaml files; we detect type and save via archtownDb.
 */
import yaml from 'js-yaml';
import { yamlToProject } from '../lib/projectYaml';
import { yamlToOrgTeam } from '../lib/teamYaml';
import { yamlToCap } from '../lib/capabilityYaml';
import type { CapabilityLayout } from '../lib/capabilityYaml';
import { nameToId } from '../lib/idUtils';
import { sanitizeId } from '../lib/idUtils';
import * as archtownDb from './archtownDb';

function filenameStem(path: string): string {
  const name = path.split(/[/\\]/).pop() ?? path;
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

export type ImportResult = {
  projects: number;
  teams: number;
  capabilityOrder: boolean;
  caps: number;
  errors: string[];
};

/**
 * Import an array of YAML file contents with their file paths.
 * Path is used to get id (filename stem) for teams and caps.
 */
export async function importYamlFiles(
  files: Array<{ path: string; content: string }>
): Promise<ImportResult> {
  const result: ImportResult = { projects: 0, teams: 0, capabilityOrder: false, caps: 0, errors: [] };
  const projects: Array<{ id: string; data: ReturnType<typeof yamlToProject> }> = [];
  const teams: Array<{ id: string; data: ReturnType<typeof yamlToOrgTeam> }> = [];
  let capOrder: string[] = [];
  const caps: Array<{ id: string; cap: ReturnType<typeof yamlToCap> }> = [];

  for (const { path, content } of files) {
    const stem = filenameStem(path);
    try {
      const raw = yaml.load(content);
      if (Array.isArray(raw)) {
        capOrder = raw.map((x) => String(x).trim()).filter(Boolean);
        result.capabilityOrder = true;
        continue;
      }
      if (!raw || typeof raw !== 'object') continue;
      const obj = raw as Record<string, unknown>;
      if (Array.isArray(obj.teams) && typeof obj.name === 'string') {
        const data = yamlToProject(content);
        const id = sanitizeId((data.id ?? nameToId(data.projectName)) || stem) || 'project';
        projects.push({ id, data: { ...data, id, teams: data.teams } });
        continue;
      }
      if (
        typeof obj.name === 'string' &&
        (obj.owner !== undefined || obj.parent !== undefined || Array.isArray(obj.childIds)) &&
        !Array.isArray(obj.projects)
      ) {
        const data = yamlToOrgTeam(stem, content);
        teams.push({ id: data.id, data });
        continue;
      }
      if (Array.isArray(obj.projects) && typeof obj.name === 'string' && !('teams' in obj)) {
        const cap = yamlToCap(stem, content);
        caps.push({ id: cap.id, cap });
        continue;
      }
    } catch (e) {
      result.errors.push(`${path}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  for (const { id, data } of projects) {
    try {
      await archtownDb.saveProject(data.projectName, data);
      result.projects++;
    } catch (e) {
      result.errors.push(`Project ${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  for (const { id, data } of teams) {
    try {
      await archtownDb.saveTeam(id, data);
      result.teams++;
    } catch (e) {
      result.errors.push(`Team ${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (capOrder.length > 0 || caps.length > 0) {
    try {
      const existing = await archtownDb.getCapabilityLayout();
      const layout: CapabilityLayout = {
        capOrder: capOrder.length > 0 ? capOrder : existing.layout.capOrder,
        caps: { ...existing.layout.caps },
      };
      for (const { id, cap } of caps) {
        layout.caps[id] = cap;
        if (!layout.capOrder.includes(id)) layout.capOrder.push(id);
        result.caps++;
      }
      await archtownDb.saveCapabilityLayout(layout);
      if (capOrder.length > 0) result.capabilityOrder = true;
    } catch (e) {
      result.errors.push(`Capability: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return result;
}
