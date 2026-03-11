/**
 * One-time migration: ตั้ง id ให้เป็นตัวเล็กทั้งหมด เชื่อมด้วย _
 * - data/projects: เพิ่ม id ใน YAML, เปลี่ยนชื่อไฟล์เป็น id.yaml
 * - data/capability: เปลี่ยน cap id และ project id เป็น lowercase_underscore, เปลี่ยนชื่อไฟล์
 * - data/teams: เปลี่ยนชื่อไฟล์เป็น id.yaml และอัปเดต parent/child refs
 * Run: npx tsx scripts/migrate-ids.ts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { nameToId, sanitizeId, ensureUniqueId } from '../src/lib/idUtils';
import { yamlToProject, projectToYaml } from '../src/lib/projectYaml';
import { importFromMarkdown } from '../src/lib/projectMarkdown';
import { yamlToCap, capToYaml, yamlToCapOrder, capOrderToYaml } from '../src/lib/capabilityYaml';
import { yamlToOrgTeam, orgTeamToYaml } from '../src/lib/teamYaml';
import type { ProjectData } from '../src/lib/projectYaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_PROJECTS_DIR = path.join(ROOT, 'data', 'projects');
const DATA_TEAMS_DIR = path.join(ROOT, 'data', 'teams');
const DATA_CAPABILITY_DIR = path.join(ROOT, 'data', 'capability');
const CAPABILITY_ORDER_FILE_YAML = '_order.yaml';

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function migrateProjects() {
  ensureDir(DATA_PROJECTS_DIR);
  const files = fs.readdirSync(DATA_PROJECTS_DIR).filter(
    (f) => f.endsWith('.yaml') || f.endsWith('.md')
  );
  for (const f of files) {
    const ext = f.endsWith('.yaml') ? '.yaml' : '.md';
    const oldStem = f.slice(0, -ext.length);
    const fullPath = path.join(DATA_PROJECTS_DIR, f);
    const content = fs.readFileSync(fullPath, 'utf-8');
    let name = oldStem;
    let data: ProjectData;
    if (ext === '.yaml') {
      data = yamlToProject(content);
      name = data.projectName || oldStem;
    } else {
      data = importFromMarkdown(content);
      name = data.projectName || oldStem;
    }
    const newId = sanitizeId(data.id || '') || sanitizeId(nameToId(name)) || 'project';
    const payload: ProjectData = { ...data, id: newId };
    const toWrite = projectToYaml(payload);
    const newPath = path.join(DATA_PROJECTS_DIR, `${newId}.yaml`);
    fs.writeFileSync(newPath, toWrite, 'utf-8');
    if (path.basename(newPath) !== f) {
      fs.unlinkSync(fullPath);
      console.log('Project:', oldStem, '->', newId);
    } else {
      console.log('Project:', oldStem, '(id set)');
    }
  }
}

function migrateCapability() {
  ensureDir(DATA_CAPABILITY_DIR);
  const orderPath = path.join(DATA_CAPABILITY_DIR, CAPABILITY_ORDER_FILE_YAML);
  if (!fs.existsSync(orderPath)) {
    console.log('No _order.yaml in capability, skip');
    return;
  }
  const capOrder: string[] = yamlToCapOrder(fs.readFileSync(orderPath, 'utf-8'));
  const newOrder: string[] = [];
  const renames: { old: string; new: string }[] = [];

  for (const oldCapId of capOrder) {
    const yamlPath = path.join(DATA_CAPABILITY_DIR, `${oldCapId}.yaml`);
    const mdPath = path.join(DATA_CAPABILITY_DIR, `${oldCapId}.md`);
    if (!fs.existsSync(yamlPath) && !fs.existsSync(mdPath)) {
      newOrder.push(sanitizeId(nameToId(oldCapId)) || oldCapId);
      continue;
    }
    const content = fs.readFileSync(
      fs.existsSync(yamlPath) ? yamlPath : mdPath,
      'utf-8'
    );
    const cap = yamlToCap(oldCapId, content);
    const newCapId = sanitizeId(nameToId(cap.name)) || sanitizeId(oldCapId) || 'cap';
    const newProjects = cap.projects.map((p) => ({
      ...p,
      id: sanitizeId(nameToId(p.name)) || sanitizeId(p.id) || p.id,
      name: p.name,
    }));
    const newCap = { ...cap, id: newCapId, name: cap.name, projects: newProjects };
    const toWrite = capToYaml(newCap);
    const newPath = path.join(DATA_CAPABILITY_DIR, `${newCapId}.yaml`);
    fs.writeFileSync(newPath, toWrite, 'utf-8');
    newOrder.push(newCapId);
    if (newCapId !== oldCapId) {
      renames.push({ old: oldCapId, new: newCapId });
      const oldPath = fs.existsSync(yamlPath) ? yamlPath : mdPath;
      fs.unlinkSync(oldPath);
      console.log('Cap:', oldCapId, '->', newCapId);
    }
  }

  fs.writeFileSync(orderPath, capOrderToYaml(newOrder), 'utf-8');
  console.log('Capability _order updated');
}

function migrateTeams() {
  ensureDir(DATA_TEAMS_DIR);
  const files = fs.readdirSync(DATA_TEAMS_DIR).filter(
    (f) => f.endsWith('.yaml') || f.endsWith('.md')
  );
  const teams: { oldId: string; team: ReturnType<typeof yamlToOrgTeam> }[] = [];
  for (const f of files) {
    const ext = f.endsWith('.yaml') ? '.yaml' : '.md';
    const oldId = f.slice(0, -ext.length);
    const content = fs.readFileSync(path.join(DATA_TEAMS_DIR, f), 'utf-8');
    const team = yamlToOrgTeam(oldId, content);
    teams.push({ oldId, team });
  }
  const oldToNew = new Map<string, string>();
  const usedNewIds: string[] = [];
  for (const { oldId, team } of teams) {
    const baseId = sanitizeId(nameToId(team.name)) || sanitizeId(oldId) || 'team';
    const newId = ensureUniqueId(baseId, usedNewIds);
    usedNewIds.push(newId);
    oldToNew.set(oldId, newId);
  }
  for (const { oldId, team } of teams) {
    const newId = oldToNew.get(oldId)!;
    const updated = {
      ...team,
      id: newId,
      parentId: team.parentId && oldToNew.has(team.parentId) ? oldToNew.get(team.parentId)! : team.parentId,
      childIds: team.childIds.map((c) => oldToNew.get(c) || c),
    };
    const toWrite = orgTeamToYaml(updated);
    const newPath = path.join(DATA_TEAMS_DIR, `${newId}.yaml`);
    fs.writeFileSync(newPath, toWrite, 'utf-8');
    const oldPath = path.join(DATA_TEAMS_DIR, `${oldId}.yaml`);
    const oldPathMd = path.join(DATA_TEAMS_DIR, `${oldId}.md`);
    if (oldId !== newId) {
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      if (fs.existsSync(oldPathMd)) fs.unlinkSync(oldPathMd);
      console.log('Team:', oldId, '->', newId);
    }
  }
}

function main() {
  console.log('Migrate ids to lowercase_underscore...\n--- Projects ---');
  migrateProjects();
  console.log('\n--- Capability ---');
  migrateCapability();
  console.log('\n--- Teams ---');
  migrateTeams();
  console.log('\nDone.');
}

main();
