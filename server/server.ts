/**
 * Production server: serves static dist/ and API that read/write data/*.yaml.
 * Data root = process.cwd()/data (in Docker = /app/data).
 */
import express from 'express';
import fs from 'fs';
import path from 'path';

import { importFromMarkdown } from '../src/lib/projectMarkdown';
import { yamlToProject, projectToYaml } from '../src/lib/projectYaml';
import { markdownToOrgTeam } from '../src/lib/teamMarkdown';
import { yamlToOrgTeam, orgTeamToYaml } from '../src/lib/teamYaml';
import { markdownToCab, orderMarkdownToCabIds } from '../src/lib/cabilityMarkdown';
import {
  yamlToCab,
  cabToYaml,
  yamlToCabOrder,
  cabOrderToYaml,
} from '../src/lib/cabilityYaml';
import { nameToId, sanitizeId } from '../src/lib/idUtils';

const DATA_ROOT = path.join(process.cwd(), 'data');
const DATA_PROJECTS_DIR = path.join(DATA_ROOT, 'projects');
const DATA_TEAMS_DIR = path.join(DATA_ROOT, 'teams');
const DATA_CABILITY_DIR = path.join(DATA_ROOT, 'cability');
const CABILITY_ORDER_FILE_MD = '_order.md';
const CABILITY_ORDER_FILE_YAML = '_order.yaml';

function safeTeamId(id: string): string {
  return sanitizeId(id) || 'team';
}

function safeCabId(id: string): string {
  return sanitizeId(id) || 'cab';
}

function toCamelCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((word, i) =>
      i === 0
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join('');
}

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolve project id (from cability) to project file path in data/projects.
 * 1) Exact id match (.yaml / .md)
 * 2) Case-insensitive filename stem match
 * So cability and data/projects stay in sync for status lookup.
 */
function resolveProjectPath(projId: string): { path: string; ext: 'yaml' | 'md' } | null {
  const exactYaml = path.join(DATA_PROJECTS_DIR, `${projId}.yaml`);
  const exactMd = path.join(DATA_PROJECTS_DIR, `${projId}.md`);
  if (fs.existsSync(exactYaml)) return { path: exactYaml, ext: 'yaml' };
  if (fs.existsSync(exactMd)) return { path: exactMd, ext: 'md' };
  const lowerId = projId.toLowerCase();
  const files = fs.readdirSync(DATA_PROJECTS_DIR);
  for (const f of files) {
    const stem = f.endsWith('.yaml')
      ? f.slice(0, -5)
      : f.endsWith('.md')
        ? f.slice(0, -3)
        : null;
    if (stem && stem.toLowerCase() === lowerId) {
      if (f.endsWith('.yaml')) return { path: path.join(DATA_PROJECTS_DIR, f), ext: 'yaml' };
      if (f.endsWith('.md')) return { path: path.join(DATA_PROJECTS_DIR, f), ext: 'md' };
    }
  }
  return null;
}

/**
 * Build map: normalized project name -> { path, ext } from data/projects.
 * Used to match cability project by name when id does not match filename.
 */
function buildProjectNameToPath(): Map<string, { path: string; ext: 'yaml' | 'md' }> {
  const map = new Map<string, { path: string; ext: 'yaml' | 'md' }>();
  const files = fs.readdirSync(DATA_PROJECTS_DIR);
  for (const f of files) {
    const fullPath = path.join(DATA_PROJECTS_DIR, f);
    if (!fs.statSync(fullPath).isFile()) continue;
    const ext = f.endsWith('.yaml') ? 'yaml' : f.endsWith('.md') ? 'md' : null;
    if (!ext) continue;
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const data =
        ext === 'yaml' ? yamlToProject(content) : importFromMarkdown(content);
      const name = data?.projectName ?? '';
      const key = normalizeForMatch(name);
      if (key && !map.has(key)) map.set(key, { path: fullPath, ext });
    } catch (_) {}
  }
  return map;
}

const app = express();
app.use(express.json({ limit: '2mb' }));

// --- Projects API ---
app.get('/api/projects', (_req, res) => {
  try {
    fs.mkdirSync(DATA_PROJECTS_DIR, { recursive: true });
    const files = fs.readdirSync(DATA_PROJECTS_DIR);
    const list: Array<{
      id: string;
      name: string;
      description?: string | null;
      summaryStatus: 'RED' | 'YELLOW' | 'GREEN' | null;
    }> = [];
    const seenIds = new Set<string>();
    const addFromFile = (
      _f: string,
      fileId: string,
      content: string,
      isYaml: boolean
    ) => {
      let name = fileId;
      let summaryStatus: 'RED' | 'YELLOW' | 'GREEN' | null = null;
      let description: string | null = null;
      let id = fileId;
      try {
        if (isYaml) {
          const data = yamlToProject(content);
          name = data.projectName || fileId;
          description =
            typeof data.description === 'string' && data.description.trim()
              ? data.description.trim()
              : null;
          if (data.id && typeof data.id === 'string' && data.id.trim()) {
            id = data.id.trim();
          }
          for (const t of data.teams) {
            for (const top of t.topics) {
              for (const sub of top.subTopics) {
                if (sub.status === 'RED') summaryStatus = 'RED';
                else if (sub.status === 'YELLOW')
                  summaryStatus = summaryStatus === 'RED' ? 'RED' : 'YELLOW';
                else if (!summaryStatus) summaryStatus = 'GREEN';
              }
            }
          }
        } else {
          const lines = content.split(/\r?\n/);
          const h1 = lines.find((l) => /^#\s+.+/.test(l));
          if (h1) name = h1.replace(/^#\s+/, '').trim();
          const statusMatch = content.match(/\((RED|YELLOW|GREEN)\)/g);
          if (statusMatch?.length) {
            if (statusMatch.some((s) => s === '(RED)')) summaryStatus = 'RED';
            else if (statusMatch.some((s) => s === '(YELLOW)'))
              summaryStatus = 'YELLOW';
            else summaryStatus = 'GREEN';
          }
        }
      } catch (_) {}
      if (seenIds.has(id)) return;
      seenIds.add(id);
      list.push({ id, name, description, summaryStatus });
    };
    const yamlFiles = files.filter((f) => f.endsWith('.yaml'));
    const mdFiles = files.filter((f) => f.endsWith('.md'));
    for (const f of yamlFiles) {
      const id = f.slice(0, -5);
      addFromFile(
        f,
        id,
        fs.readFileSync(path.join(DATA_PROJECTS_DIR, f), 'utf-8'),
        true
      );
    }
    for (const f of mdFiles) {
      const id = f.slice(0, -3);
      addFromFile(
        f,
        id,
        fs.readFileSync(path.join(DATA_PROJECTS_DIR, f), 'utf-8'),
        false
      );
    }
    res.json({ projects: list });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get('/api/projects/:id', (req, res) => {
  const rawId = decodeURIComponent(req.params.id);
  const safeId = rawId.replace(/[^a-zA-Z0-9_-]/g, '') || 'project';
  const resolved = resolveProjectPath(safeId);
  try {
    if (resolved) {
      const content = fs.readFileSync(resolved.path, 'utf-8');
      const data =
        resolved.ext === 'yaml' ? yamlToProject(content) : importFromMarkdown(content);
      const outId = (data && (data as { id?: string }).id) || safeId;
      return res.json({ id: outId, data });
    }
    res.status(404).json({ error: 'Not found' });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post('/api/save-project', (req, res) => {
  try {
    const { projectName, data, markdown } = req.body || {};
    const name = (projectName || 'project').trim();
    fs.mkdirSync(DATA_PROJECTS_DIR, { recursive: true });
    let payload: { id?: string; projectName: string; teams: unknown[] };
    if (
      data != null &&
      typeof data === 'object' &&
      Array.isArray(data.teams)
    ) {
      payload = {
        id: typeof data.id === 'string' ? data.id.trim() : undefined,
        projectName: data.projectName ?? name,
        teams: data.teams,
      };
    } else if (typeof markdown === 'string') {
      const imported = importFromMarkdown(markdown);
      payload = { projectName: imported.projectName, teams: imported.teams };
    } else {
      return res.status(400).json({ ok: false, error: 'Missing data or markdown' });
    }
    const fileId =
      sanitizeId(payload.id || '') || sanitizeId(nameToId(name)) || 'project';
    const toWrite = projectToYaml({
      ...payload,
      id: fileId,
      projectName: payload.projectName,
      teams: payload.teams as import('../src/types').Team[],
    });
    const filePath = path.join(DATA_PROJECTS_DIR, `${fileId}.yaml`);
    fs.writeFileSync(filePath, toWrite, 'utf-8');
    res.json({ ok: true, id: fileId, path: filePath });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// --- Teams API ---
app.get('/api/teams', (_req, res) => {
  try {
    fs.mkdirSync(DATA_TEAMS_DIR, { recursive: true });
    const files = fs.readdirSync(DATA_TEAMS_DIR);
    const yamlFiles = files.filter((f) => f.endsWith('.yaml'));
    const mdFiles = files.filter((f) => f.endsWith('.md'));
    const ids = new Set<string>();
    for (const f of yamlFiles) ids.add(f.slice(0, -5));
    for (const f of mdFiles) ids.add(f.slice(0, -3));
    res.json({ ids: Array.from(ids) });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get('/api/teams/:id', (req, res) => {
  const id = safeTeamId(req.params.id);
  const yamlPath = path.join(DATA_TEAMS_DIR, `${id}.yaml`);
  const mdPath = path.join(DATA_TEAMS_DIR, `${id}.md`);
  try {
    if (fs.existsSync(yamlPath)) {
      const data = yamlToOrgTeam(id, fs.readFileSync(yamlPath, 'utf-8'));
      return res.json({ id, data });
    }
    if (fs.existsSync(mdPath)) {
      const data = markdownToOrgTeam(id, fs.readFileSync(mdPath, 'utf-8'));
      return res.json({ id, data });
    }
    res.status(404).json({ error: 'Not found' });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post('/api/teams/save', (req, res) => {
  try {
    const { id, data, markdown } = req.body || {};
    const safeId = safeTeamId(String(id || 'team'));
    fs.mkdirSync(DATA_TEAMS_DIR, { recursive: true });
    const filePath = path.join(DATA_TEAMS_DIR, `${safeId}.yaml`);
    let toWrite: string;
    if (data != null && typeof data === 'object' && 'name' in data) {
      toWrite = orgTeamToYaml({ ...data, id: safeId });
    } else if (typeof markdown === 'string') {
      toWrite = orgTeamToYaml(markdownToOrgTeam(safeId, markdown));
    } else {
      return res.status(400).json({ ok: false, error: 'Missing data or markdown' });
    }
    fs.writeFileSync(filePath, toWrite, 'utf-8');
    res.json({ ok: true, id: safeId });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// --- Cability API ---
app.get('/api/cability', (_req, res) => {
  try {
    fs.mkdirSync(DATA_CABILITY_DIR, { recursive: true });
    const orderPathYaml = path.join(DATA_CABILITY_DIR, CABILITY_ORDER_FILE_YAML);
    const orderPathMd = path.join(DATA_CABILITY_DIR, CABILITY_ORDER_FILE_MD);
    let cabOrder: string[] = [];
    if (fs.existsSync(orderPathYaml)) {
      cabOrder = yamlToCabOrder(fs.readFileSync(orderPathYaml, 'utf-8'));
    } else if (fs.existsSync(orderPathMd)) {
      cabOrder = orderMarkdownToCabIds(fs.readFileSync(orderPathMd, 'utf-8'));
    }
    const cabs: Record<
      string,
      {
        id: string;
        name: string;
        cols?: 12 | 6 | 4 | 3;
        projects: Array<{
          id: string;
          name: string;
          status?: string;
          cols?: 12 | 6 | 4 | 3;
        }>;
      }
    > = {};
    const files = fs.readdirSync(DATA_CABILITY_DIR);
    const cabFilesYaml = files.filter(
      (f) => f.endsWith('.yaml') && f !== CABILITY_ORDER_FILE_YAML
    );
    const cabFilesMd = files.filter(
      (f) => f.endsWith('.md') && f !== CABILITY_ORDER_FILE_MD
    );
    const seen = new Set(cabOrder);
    for (const f of cabFilesYaml) {
      const id = f.slice(0, -5);
      if (!seen.has(id)) {
        seen.add(id);
        cabOrder.push(id);
      }
    }
    for (const f of cabFilesMd) {
      const id = f.slice(0, -3);
      if (!seen.has(id)) {
        seen.add(id);
        cabOrder.push(id);
      }
    }
    for (const id of cabOrder) {
      const yamlPath = path.join(DATA_CABILITY_DIR, `${id}.yaml`);
      const mdPath = path.join(DATA_CABILITY_DIR, `${id}.md`);
      if (fs.existsSync(yamlPath)) {
        cabs[id] = yamlToCab(id, fs.readFileSync(yamlPath, 'utf-8'));
      } else if (fs.existsSync(mdPath)) {
        cabs[id] = markdownToCab(id, fs.readFileSync(mdPath, 'utf-8'));
      } else {
        cabs[id] = {
          id: safeCabId(id),
          name: id,
          cols: 4,
          projects: [],
        };
      }
    }
    res.json({ layout: { cabOrder, cabs } });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** Summary of Critical/Warning tasks per Cap (Cab) and Project for right panel. Optional projectId = filter to one project. */
app.get('/api/cability/summary', (req, res) => {
  try {
    const projectId = typeof req.query?.projectId === 'string' ? req.query.projectId.trim() : undefined;
    fs.mkdirSync(DATA_CABILITY_DIR, { recursive: true });
    fs.mkdirSync(DATA_PROJECTS_DIR, { recursive: true });
    const orderPathYaml = path.join(DATA_CABILITY_DIR, CABILITY_ORDER_FILE_YAML);
    const orderPathMd = path.join(DATA_CABILITY_DIR, CABILITY_ORDER_FILE_MD);
    let cabOrder: string[] = [];
    if (fs.existsSync(orderPathYaml)) {
      cabOrder = yamlToCabOrder(fs.readFileSync(orderPathYaml, 'utf-8'));
    } else if (fs.existsSync(orderPathMd)) {
      cabOrder = orderMarkdownToCabIds(fs.readFileSync(orderPathMd, 'utf-8'));
    }
    const cabs: Record<
      string,
      {
        id: string;
        name: string;
        projects: Array<{ id: string; name: string }>;
      }
    > = {};
    const files = fs.readdirSync(DATA_CABILITY_DIR);
    const cabFilesYaml = files.filter(
      (f) => f.endsWith('.yaml') && f !== CABILITY_ORDER_FILE_YAML
    );
    const cabFilesMd = files.filter(
      (f) => f.endsWith('.md') && f !== CABILITY_ORDER_FILE_MD
    );
    const seen = new Set(cabOrder);
    for (const f of cabFilesYaml) {
      const id = f.slice(0, -5);
      if (!seen.has(id)) {
        seen.add(id);
        cabOrder.push(id);
      }
    }
    for (const f of cabFilesMd) {
      const id = f.slice(0, -3);
      if (!seen.has(id)) {
        seen.add(id);
        cabOrder.push(id);
      }
    }
    for (const id of cabOrder) {
      const yamlPath = path.join(DATA_CABILITY_DIR, `${id}.yaml`);
      const mdPath = path.join(DATA_CABILITY_DIR, `${id}.md`);
      if (fs.existsSync(yamlPath)) {
        const cab = yamlToCab(id, fs.readFileSync(yamlPath, 'utf-8'));
        cabs[id] = {
          id: cab.id,
          name: cab.name,
          projects: cab.projects.map((p) => ({ id: p.id, name: p.name })),
        };
      } else if (fs.existsSync(mdPath)) {
        const cab = markdownToCab(id, fs.readFileSync(mdPath, 'utf-8'));
        cabs[id] = {
          id: cab.id,
          name: cab.name,
          projects: cab.projects.map((p) => ({ id: p.id, name: p.name })),
        };
      } else {
        cabs[id] = { id: safeCabId(id), name: id, projects: [] };
      }
    }

    const critical: Array<{ cabName: string; projectName: string; taskName: string }> = [];
    const warning: Array<{ cabName: string; projectName: string; taskName: string }> = [];

    const projectByName = buildProjectNameToPath();

    for (const cabId of cabOrder) {
      const cab = cabs[cabId];
      if (!cab) continue;
      const cabName = cab.name || cabId;
      for (const proj of cab.projects) {
        if (projectId && proj.id !== projectId) continue;
        const projectName = proj.name || proj.id;
        let resolved = resolveProjectPath(proj.id);
        if (!resolved) {
          const byName = projectByName.get(normalizeForMatch(proj.name));
          if (byName) resolved = byName;
        }
        if (!resolved) continue;
        let data: { projectName?: string; teams?: Array<{ topics?: Array<{ subTopics?: Array<{ title: string; status: string }> }> }> } | null = null;
        try {
          const content = fs.readFileSync(resolved.path, 'utf-8');
          if (resolved.ext === 'yaml') {
            data = yamlToProject(content);
          } else {
            data = importFromMarkdown(content);
          }
        } catch (_) {
          continue;
        }
        if (!data || !Array.isArray(data.teams)) continue;
        for (const team of data.teams) {
          if (!Array.isArray(team.topics)) continue;
          for (const topic of team.topics) {
            if (!Array.isArray(topic.subTopics)) continue;
            for (const sub of topic.subTopics) {
              const status = String(sub?.status || '').toUpperCase();
              const title = typeof sub?.title === 'string' ? sub.title.trim() : '';
              if (!title) continue;
              if (status === 'RED') {
                critical.push({ cabName, projectName, taskName: title });
              } else if (status === 'YELLOW') {
                warning.push({ cabName, projectName, taskName: title });
              }
            }
          }
        }
      }
    }

    res.json({ critical, warning });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post('/api/cability/save', (req, res) => {
  try {
    const { layout } = req.body || {};
    if (
      !layout ||
      !Array.isArray(layout.cabOrder) ||
      typeof layout.cabs !== 'object'
    ) {
      return res
        .status(400)
        .json({ ok: false, error: 'Invalid layout' });
    }
    fs.mkdirSync(DATA_CABILITY_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(DATA_CABILITY_DIR, CABILITY_ORDER_FILE_YAML),
      cabOrderToYaml(layout.cabOrder),
      'utf-8'
    );
    for (const id of layout.cabOrder) {
      const cab = layout.cabs[id];
      if (cab) {
        const safeId = safeCabId(id);
        fs.writeFileSync(
          path.join(DATA_CABILITY_DIR, `${safeId}.yaml`),
          cabToYaml(cab),
          'utf-8'
        );
      }
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// --- Static (SPA) ---
const distDir = path.join(process.cwd(), 'dist');
app.use(express.static(distDir));
app.get('*', (_req, res) => {
  const index = path.join(distDir, 'index.html');
  if (fs.existsSync(index)) {
    res.sendFile(index);
  } else {
    res.status(404).send('Not found');
  }
});

const PORT = Number(process.env.PORT) || 80;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Data directory: ${DATA_ROOT}`);
});
