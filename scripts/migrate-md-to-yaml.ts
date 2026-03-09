/**
 * One-time migration: read all .md files in data/projects, data/teams, data/cability
 * and write equivalent .yaml files. Does not delete .md files.
 * Run: npx tsx scripts/migrate-md-to-yaml.ts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { importFromMarkdown } from '../src/lib/projectMarkdown';
import { projectToYaml } from '../src/lib/projectYaml';
import { markdownToOrgTeam } from '../src/lib/teamMarkdown';
import { orgTeamToYaml } from '../src/lib/teamYaml';
import { markdownToCab, orderMarkdownToCabIds } from '../src/lib/cabilityMarkdown';
import { cabToYaml, cabOrderToYaml } from '../src/lib/cabilityYaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_PROJECTS_DIR = path.join(ROOT, 'data', 'projects');
const DATA_TEAMS_DIR = path.join(ROOT, 'data', 'teams');
const DATA_CABILITY_DIR = path.join(ROOT, 'data', 'cability');
const CABILITY_ORDER_FILE_MD = '_order.md';
const CABILITY_ORDER_FILE_YAML = '_order.yaml';

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function migrateProjects() {
  ensureDir(DATA_PROJECTS_DIR);
  const files = fs.readdirSync(DATA_PROJECTS_DIR).filter((f) => f.endsWith('.md'));
  for (const f of files) {
    const id = f.slice(0, -3);
    const mdPath = path.join(DATA_PROJECTS_DIR, f);
    const yamlPath = path.join(DATA_PROJECTS_DIR, `${id}.yaml`);
    const md = fs.readFileSync(mdPath, 'utf-8');
    const data = importFromMarkdown(md);
    const yamlStr = projectToYaml(data);
    fs.writeFileSync(yamlPath, yamlStr, 'utf-8');
    console.log('Project:', id, '->', `${id}.yaml`);
  }
}

function migrateTeams() {
  ensureDir(DATA_TEAMS_DIR);
  const files = fs.readdirSync(DATA_TEAMS_DIR).filter((f) => f.endsWith('.md'));
  for (const f of files) {
    const id = f.slice(0, -3);
    const mdPath = path.join(DATA_TEAMS_DIR, f);
    const yamlPath = path.join(DATA_TEAMS_DIR, `${id}.yaml`);
    const md = fs.readFileSync(mdPath, 'utf-8');
    const team = markdownToOrgTeam(id, md);
    const yamlStr = orgTeamToYaml(team);
    fs.writeFileSync(yamlPath, yamlStr, 'utf-8');
    console.log('Team:', id, '->', `${id}.yaml`);
  }
}

function migrateCability() {
  ensureDir(DATA_CABILITY_DIR);
  const orderMdPath = path.join(DATA_CABILITY_DIR, CABILITY_ORDER_FILE_MD);
  if (fs.existsSync(orderMdPath)) {
    const md = fs.readFileSync(orderMdPath, 'utf-8');
    const cabOrder = orderMarkdownToCabIds(md);
    const yamlStr = cabOrderToYaml(cabOrder);
    fs.writeFileSync(path.join(DATA_CABILITY_DIR, CABILITY_ORDER_FILE_YAML), yamlStr, 'utf-8');
    console.log('Cability order -> _order.yaml');
  }
  const files = fs.readdirSync(DATA_CABILITY_DIR).filter((f) => f.endsWith('.md') && f !== CABILITY_ORDER_FILE_MD);
  for (const f of files) {
    const id = f.slice(0, -3);
    const mdPath = path.join(DATA_CABILITY_DIR, f);
    const yamlPath = path.join(DATA_CABILITY_DIR, `${id}.yaml`);
    const md = fs.readFileSync(mdPath, 'utf-8');
    const cab = markdownToCab(id, md);
    const yamlStr = cabToYaml(cab);
    fs.writeFileSync(yamlPath, yamlStr, 'utf-8');
    console.log('Cab:', id, '->', `${id}.yaml`);
  }
}

console.log('Migrating data/*.md -> data/*.yaml ...\n');
migrateProjects();
console.log('');
migrateTeams();
console.log('');
migrateCability();
console.log('\nDone. .md files were left in place; you can remove them after verifying.');
