/**
 * Production server: serves static dist/ and API that read/write data/*.yaml.
 * Data root = process.cwd()/data (in Docker = /app/data).
 */
import express from 'express';
import fs from 'fs';
import path from 'path';

import { yamlToProject, projectToYaml } from '../src/lib/projectYaml';
import { yamlToOrgTeam, orgTeamToYaml } from '../src/lib/teamYaml';
import {
  yamlToCap,
  capToYaml,
  yamlToCapOrder,
  capOrderToYaml,
} from '../src/lib/capabilityYaml';
import { nameToId, sanitizeId } from '../src/lib/idUtils';

const DATA_ROOT = path.join(process.cwd(), 'data');
const DATA_PROJECTS_DIR = path.join(DATA_ROOT, 'projects');
const DATA_TEAMS_DIR = path.join(DATA_ROOT, 'teams');
const DATA_CAPABILITY_DIR = path.join(DATA_ROOT, 'capability');
const CAPABILITY_ORDER_FILE_YAML = '_order.yaml';

function safeTeamId(id: string): string {
  return sanitizeId(id) || 'team';
}

function safeCapId(id: string): string {
  return sanitizeId(id) || 'cap';
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
 * Resolve project id to project file path in data/projects. YAML only.
 * 1) Exact id match (.yaml)
 * 2) Case-insensitive filename stem match
 */
function resolveProjectPath(projId: string): { path: string; ext: 'yaml' } | null {
  const exactYaml = path.join(DATA_PROJECTS_DIR, `${projId}.yaml`);
  if (fs.existsSync(exactYaml)) return { path: exactYaml, ext: 'yaml' };
  const lowerId = projId.toLowerCase();
  const files = fs.readdirSync(DATA_PROJECTS_DIR);
  for (const f of files) {
    if (!f.endsWith('.yaml')) continue;
    const stem = f.slice(0, -5);
    if (stem.toLowerCase() === lowerId) {
      return { path: path.join(DATA_PROJECTS_DIR, f), ext: 'yaml' };
    }
  }
  return null;
}

/**
 * Build map: normalized project name -> { path, ext } from data/projects. YAML only.
 */
function buildProjectNameToPath(): Map<string, { path: string; ext: 'yaml' }> {
  const map = new Map<string, { path: string; ext: 'yaml' }>();
  const files = fs.readdirSync(DATA_PROJECTS_DIR);
  for (const f of files) {
    if (!f.endsWith('.yaml')) continue;
    const fullPath = path.join(DATA_PROJECTS_DIR, f);
    if (!fs.statSync(fullPath).isFile()) continue;
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const data = yamlToProject(content);
      const name = data?.projectName ?? '';
      const key = normalizeForMatch(name);
      if (key && !map.has(key)) map.set(key, { path: fullPath, ext: 'yaml' });
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
      content: string
    ) => {
      let name = fileId;
      let summaryStatus: 'RED' | 'YELLOW' | 'GREEN' | null = null;
      let description: string | null = null;
      let id = fileId;
      try {
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
      } catch (_) {}
      if (seenIds.has(id)) return;
      seenIds.add(id);
      list.push({ id, name, description, summaryStatus });
    };
    const yamlFiles = files.filter((f) => f.endsWith('.yaml'));
    for (const f of yamlFiles) {
      const id = f.slice(0, -5);
      addFromFile(
        f,
        id,
        fs.readFileSync(path.join(DATA_PROJECTS_DIR, f), 'utf-8')
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
      const data = yamlToProject(content);
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
    const { projectName, data } = req.body || {};
    const name = (projectName || 'project').trim();
    fs.mkdirSync(DATA_PROJECTS_DIR, { recursive: true });
    if (
      data == null ||
      typeof data !== 'object' ||
      !Array.isArray(data.teams)
    ) {
      return res.status(400).json({ ok: false, error: 'Missing data' });
    }
    const payload = {
      id: typeof data.id === 'string' ? data.id.trim() : undefined,
      projectName: data.projectName ?? name,
      description: typeof data.description === 'string' ? data.description.trim() || undefined : undefined,
      teams: data.teams,
    };
    const fileId =
      sanitizeId(payload.id || '') || sanitizeId(nameToId(name)) || 'project';
    const toWrite = projectToYaml({
      id: fileId,
      projectName: payload.projectName,
      description: payload.description,
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
    const ids = new Set<string>();
    for (const f of yamlFiles) ids.add(f.slice(0, -5));
    res.json({ ids: Array.from(ids) });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get('/api/teams/:id', (req, res) => {
  const id = safeTeamId(req.params.id);
  const yamlPath = path.join(DATA_TEAMS_DIR, `${id}.yaml`);
  try {
    if (fs.existsSync(yamlPath)) {
      const data = yamlToOrgTeam(id, fs.readFileSync(yamlPath, 'utf-8'));
      return res.json({ id, data });
    }
    res.status(404).json({ error: 'Not found' });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post('/api/teams/save', (req, res) => {
  try {
    const { id, data } = req.body || {};
    const safeId = safeTeamId(String(id || 'team'));
    fs.mkdirSync(DATA_TEAMS_DIR, { recursive: true });
    const filePath = path.join(DATA_TEAMS_DIR, `${safeId}.yaml`);
    if (data != null && typeof data === 'object' && 'name' in data) {
      const toWrite = orgTeamToYaml({ ...data, id: safeId });
      fs.writeFileSync(filePath, toWrite, 'utf-8');
      res.json({ ok: true, id: safeId });
    } else {
      res.status(400).json({ ok: false, error: 'Missing data' });
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// --- Capability API ---
app.get('/api/capability', (_req, res) => {
  try {
    fs.mkdirSync(DATA_CAPABILITY_DIR, { recursive: true });
    const orderPathYaml = path.join(DATA_CAPABILITY_DIR, CAPABILITY_ORDER_FILE_YAML);
    let capOrder: string[] = [];
    if (fs.existsSync(orderPathYaml)) {
      capOrder = yamlToCapOrder(fs.readFileSync(orderPathYaml, 'utf-8'));
    }
    const caps: Record<
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
    const files = fs.readdirSync(DATA_CAPABILITY_DIR);
    const capFilesYaml = files.filter(
      (f) => f.endsWith('.yaml') && f !== CAPABILITY_ORDER_FILE_YAML
    );
    const seen = new Set(capOrder);
    for (const f of capFilesYaml) {
      const id = f.slice(0, -5);
      if (!seen.has(id)) {
        seen.add(id);
        capOrder.push(id);
      }
    }
    for (const id of capOrder) {
      const yamlPath = path.join(DATA_CAPABILITY_DIR, `${id}.yaml`);
      if (fs.existsSync(yamlPath)) {
        caps[id] = yamlToCap(id, fs.readFileSync(yamlPath, 'utf-8'));
      } else {
        caps[id] = {
          id: safeCapId(id),
          name: id,
          cols: 4,
          projects: [],
        };
      }
    }
    res.json({ layout: { capOrder, caps } });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** Summary of Critical/Warning tasks per Cap and Project for right panel. Optional projectId = filter to one project. */
app.get('/api/capability/summary', (req, res) => {
  try {
    const projectId = typeof req.query?.projectId === 'string' ? req.query.projectId.trim() : undefined;
    fs.mkdirSync(DATA_CAPABILITY_DIR, { recursive: true });
    fs.mkdirSync(DATA_PROJECTS_DIR, { recursive: true });
    const orderPathYaml = path.join(DATA_CAPABILITY_DIR, CAPABILITY_ORDER_FILE_YAML);
    let capOrder: string[] = [];
    if (fs.existsSync(orderPathYaml)) {
      capOrder = yamlToCapOrder(fs.readFileSync(orderPathYaml, 'utf-8'));
    }
    const caps: Record<
      string,
      {
        id: string;
        name: string;
        projects: Array<{ id: string; name: string }>;
      }
    > = {};
    const files = fs.readdirSync(DATA_CAPABILITY_DIR);
    const capFilesYaml = files.filter(
      (f) => f.endsWith('.yaml') && f !== CAPABILITY_ORDER_FILE_YAML
    );
    const seen = new Set(capOrder);
    for (const f of capFilesYaml) {
      const id = f.slice(0, -5);
      if (!seen.has(id)) {
        seen.add(id);
        capOrder.push(id);
      }
    }
    for (const id of capOrder) {
      const yamlPath = path.join(DATA_CAPABILITY_DIR, `${id}.yaml`);
      if (fs.existsSync(yamlPath)) {
        const cap = yamlToCap(id, fs.readFileSync(yamlPath, 'utf-8'));
        caps[id] = {
          id: cap.id,
          name: cap.name,
          projects: cap.projects.map((p) => ({ id: p.id, name: p.name })),
        };
      } else {
        caps[id] = { id: safeCapId(id), name: id, projects: [] };
      }
    }

    const critical: Array<{ capName: string; projectName: string; taskName: string }> = [];
    const warning: Array<{ capName: string; projectName: string; taskName: string }> = [];

    const projectByName = buildProjectNameToPath();

    for (const capId of capOrder) {
      const cap = caps[capId];
      if (!cap) continue;
      const capName = cap.name || capId;
      for (const proj of cap.projects) {
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
          data = yamlToProject(content);
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
                critical.push({ capName, projectName, taskName: title });
              } else if (status === 'YELLOW') {
                warning.push({ capName, projectName, taskName: title });
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

app.post('/api/capability/save', (req, res) => {
  try {
    const { layout } = req.body || {};
    if (
      !layout ||
      !Array.isArray(layout.capOrder) ||
      typeof layout.caps !== 'object'
    ) {
      return res
        .status(400)
        .json({ ok: false, error: 'Invalid layout' });
    }
    fs.mkdirSync(DATA_CAPABILITY_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(DATA_CAPABILITY_DIR, CAPABILITY_ORDER_FILE_YAML),
      capOrderToYaml(layout.capOrder),
      'utf-8'
    );
    for (const id of layout.capOrder) {
      const cap = layout.caps[id];
      if (cap) {
        const safeId = safeCapId(id);
        fs.writeFileSync(
          path.join(DATA_CAPABILITY_DIR, `${safeId}.yaml`),
          capToYaml(cap),
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
