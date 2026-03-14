import fs from 'fs';
import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig, loadEnv} from 'vite';

import {yamlToProject, projectToYaml} from './src/lib/projectYaml';
import {nameToId, sanitizeId} from './src/lib/idUtils';
import {yamlToOrgTeam, orgTeamToYaml} from './src/lib/teamYaml';
import {yamlToCap, capToYaml, yamlToCapOrder, capOrderToYaml} from './src/lib/capabilityYaml';

const DATA_PROJECTS_DIR = path.resolve(__dirname, 'data', 'projects');
const DATA_TEAMS_DIR = path.resolve(__dirname, 'data', 'teams');
const DATA_CAPABILITY_DIR = path.resolve(__dirname, 'data', 'capability');
const CAPABILITY_ORDER_FILE_YAML = '_order.yaml';

function safeTeamId(id: string): string {
  return id.replace(/[^a-zA-Z0-9-_]/g, '') || 'team';
}

function safeCapId(id: string): string {
  return id.replace(/[^a-zA-Z0-9-_]/g, '') || 'cap';
}

/** Resolve project id to file path: YAML only. */
function resolveProjectPath(projId: string): { path: string; ext: 'yaml' } | null {
  const exactYaml = path.join(DATA_PROJECTS_DIR, `${projId}.yaml`);
  if (fs.existsSync(exactYaml)) return { path: exactYaml, ext: 'yaml' };
  const lowerId = projId.toLowerCase().replace(/[^a-z0-9_]/g, '');
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

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'projects-list-api',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            const url = req.url?.split('?')[0] ?? '';
            if (url === '/api/projects/create' && req.method === 'POST') {
              let body = '';
              req.on('data', (chunk) => { body += chunk; });
              req.on('end', () => {
                try {
                  const { name } = JSON.parse(body || '{}');
                  const projectName = (typeof name === 'string' && name.trim()) ? name.trim() : '';
                  if (!projectName) {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ ok: false, error: 'กรุณาระบุชื่อโปรเจกต์' }));
                    return;
                  }
                  const fileId = sanitizeId(nameToId(projectName)) || 'project';
                  if (resolveProjectPath(fileId)) {
                    res.statusCode = 409;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ ok: false, error: 'project id นี้มีอยู่แล้ว', id: fileId }));
                    return;
                  }
                  fs.mkdirSync(DATA_PROJECTS_DIR, { recursive: true });
                  const toWrite = projectToYaml({
                    id: fileId,
                    projectName,
                    teams: [] as import('./src/types').Team[],
                  });
                  const filePath = path.join(DATA_PROJECTS_DIR, `${fileId}.yaml`);
                  fs.writeFileSync(filePath, toWrite, 'utf-8');
                  res.statusCode = 201;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ ok: true, id: fileId }));
                } catch (e) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ ok: false, error: String(e) }));
                }
              });
              return;
            }
            const getOneMatch = url.match(/^\/api\/projects\/([^/]+)$/);
            if (getOneMatch && req.method === 'GET') {
              const rawId = decodeURIComponent(getOneMatch[1]);
              const safeId = rawId.replace(/[^a-zA-Z0-9_\-]/g, '') || 'project';
              try {
                const resolved = resolveProjectPath(safeId);
                if (!resolved) {
                  res.statusCode = 404;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'Not found' }));
                  return;
                }
                const content = fs.readFileSync(resolved.path, 'utf-8');
                const data = yamlToProject(content);
                const outId = (data && (data as { id?: string }).id) || path.basename(resolved.path, '.yaml');
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ id: outId, data }));
              } catch (e) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: String(e) }));
              }
              return;
            }
            if (url !== '/api/projects' || req.method !== 'GET') {
              return next();
            }
            try {
              fs.mkdirSync(DATA_PROJECTS_DIR, { recursive: true });
              const files = fs.readdirSync(DATA_PROJECTS_DIR);
              const list: Array<{ id: string; name: string; description?: string | null; summaryStatus: 'RED' | 'YELLOW' | 'GREEN' | null }> = [];
              const seenIds = new Set<string>();
              const addFromFile = (f: string, id: string, content: string) => {
                if (seenIds.has(id)) return;
                seenIds.add(id);
                let name = id;
                let summaryStatus: 'RED' | 'YELLOW' | 'GREEN' | null = null;
                let description: string | null = null;
                try {
                  const data = yamlToProject(content);
                  name = data.projectName || id;
                  description =
                    typeof data.description === 'string' && data.description.trim()
                      ? data.description.trim()
                      : null;
                  for (const t of data.teams) {
                    for (const top of t.topics) {
                      for (const sub of top.subTopics) {
                        if (sub.status === 'RED') summaryStatus = 'RED';
                        else if (sub.status === 'YELLOW') summaryStatus = summaryStatus === 'RED' ? 'RED' : 'YELLOW';
                        else if (!summaryStatus) summaryStatus = 'GREEN';
                      }
                    }
                  }
                } catch (_) {}
                list.push({ id, name, description, summaryStatus });
              };
              const yamlFiles = files.filter((f) => f.endsWith('.yaml'));
              for (const f of yamlFiles) {
                const id = f.slice(0, -5);
                const filePath = path.join(DATA_PROJECTS_DIR, f);
                addFromFile(f, id, fs.readFileSync(filePath, 'utf-8'));
              }
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ projects: list }));
            } catch (e) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: String(e) }));
            }
          });
        },
      },
      {
        name: 'save-project-api',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url !== '/api/save-project' || req.method !== 'POST') {
              return next();
            }
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', () => {
              try {
                const { projectName, data } = JSON.parse(body);
                const name = (projectName || 'project').trim();
                fs.mkdirSync(DATA_PROJECTS_DIR, { recursive: true });
                let payload: { id?: string; projectName: string; description?: string; teams: unknown[] };
                if (data != null && typeof data === 'object' && Array.isArray(data.teams)) {
                  payload = {
                    id: typeof data.id === 'string' ? data.id.trim() : undefined,
                    projectName: data.projectName ?? name,
                    description: typeof data.description === 'string' ? data.description.trim() || undefined : undefined,
                    teams: data.teams,
                  };
                } else {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ ok: false, error: 'Missing data' }));
                  return;
                }
                const fileId = sanitizeId(payload.id || '') || sanitizeId(nameToId(payload.projectName)) || 'project';
                const toWrite = projectToYaml({
                  id: fileId,
                  projectName: payload.projectName,
                  description: payload.description,
                  teams: payload.teams as import('./src/types').Team[],
                });
                const filePath = path.join(DATA_PROJECTS_DIR, `${fileId}.yaml`);
                fs.writeFileSync(filePath, toWrite, 'utf-8');
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ ok: true, id: fileId, path: filePath }));
              } catch (e) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ ok: false, error: String(e) }));
              }
            });
          });
        },
      },
      {
        name: 'teams-api',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            const url = req.url?.split('?')[0] ?? '';
            if (url === '/api/teams' && req.method === 'GET') {
              try {
                fs.mkdirSync(DATA_TEAMS_DIR, { recursive: true });
                const files = fs.readdirSync(DATA_TEAMS_DIR);
                const yamlFiles = files.filter((f) => f.endsWith('.yaml'));
                const ids = new Set<string>();
                for (const f of yamlFiles) ids.add(f.slice(0, -5));
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ ids: Array.from(ids) }));
              } catch (e) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: String(e) }));
              }
              return;
            }
            const getMatch = url.match(/^\/api\/teams\/([^/]+)$/);
            if (getMatch && req.method === 'GET') {
              const id = safeTeamId(getMatch[1]);
              const yamlPath = path.join(DATA_TEAMS_DIR, `${id}.yaml`);
              try {
                let data: { id: string; name: string; owner: string; parentId: string | null; childIds: string[] };
                if (fs.existsSync(yamlPath)) {
                  const yamlStr = fs.readFileSync(yamlPath, 'utf-8');
                  data = yamlToOrgTeam(id, yamlStr);
                } else {
                  res.statusCode = 404;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'Not found' }));
                  return;
                }
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ id, data }));
              } catch (e) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: String(e) }));
              }
              return;
            }
            if (url === '/api/teams/save' && req.method === 'POST') {
              let body = '';
              req.on('data', (chunk) => { body += chunk; });
              req.on('end', () => {
                try {
                  const { id, data } = JSON.parse(body);
                  const safeId = safeTeamId(String(id || 'team'));
                  fs.mkdirSync(DATA_TEAMS_DIR, { recursive: true });
                  const filePath = path.join(DATA_TEAMS_DIR, `${safeId}.yaml`);
                  let toWrite: string;
                  if (data != null && typeof data === 'object' && 'name' in data) {
                    toWrite = orgTeamToYaml({ ...data, id: safeId });
                  } else {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ ok: false, error: 'Missing data' }));
                    return;
                  }
                  fs.writeFileSync(filePath, toWrite, 'utf-8');
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ ok: true, id: safeId }));
                } catch (e) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ ok: false, error: String(e) }));
                }
              });
              return;
            }
            next();
          });
        },
      },
      {
        name: 'capability-api',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            const url = req.url?.split('?')[0] ?? '';
            if (url === '/api/capability' && req.method === 'GET') {
              try {
                fs.mkdirSync(DATA_CAPABILITY_DIR, { recursive: true });
                const orderPathYaml = path.join(DATA_CAPABILITY_DIR, CAPABILITY_ORDER_FILE_YAML);
                let capOrder: string[] = [];
                if (fs.existsSync(orderPathYaml)) {
                  capOrder = yamlToCapOrder(fs.readFileSync(orderPathYaml, 'utf-8'));
                }
                const caps: Record<string, { id: string; name: string; cols?: 12 | 6 | 4 | 3; projects: Array<{ id: string; name: string; status?: string; cols?: 12 | 6 | 4 | 3 }> }> = {};
                const files = fs.readdirSync(DATA_CAPABILITY_DIR);
                const capFilesYaml = files.filter((f) => f.endsWith('.yaml') && f !== CAPABILITY_ORDER_FILE_YAML);
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
                    caps[id] = { id: safeCapId(id), name: id, cols: 4, projects: [] };
                  }
                }
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ layout: { capOrder, caps } }));
              } catch (e) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: String(e) }));
              }
              return;
            }
            if (url === '/api/capability/summary' && req.method === 'GET') {
              try {
                const projectId = (req.url?.includes('?') ? new URLSearchParams(req.url.slice(req.url.indexOf('?') + 1)).get('projectId') : null)?.trim() || undefined;
                fs.mkdirSync(DATA_CAPABILITY_DIR, { recursive: true });
                fs.mkdirSync(DATA_PROJECTS_DIR, { recursive: true });
                const orderPathYaml = path.join(DATA_CAPABILITY_DIR, CAPABILITY_ORDER_FILE_YAML);
                let capOrder: string[] = [];
                if (fs.existsSync(orderPathYaml)) {
                  capOrder = yamlToCapOrder(fs.readFileSync(orderPathYaml, 'utf-8'));
                }
                const caps: Record<string, { id: string; name: string; projects: Array<{ id: string; name: string }> }> = {};
                const files = fs.readdirSync(DATA_CAPABILITY_DIR);
                const capFilesYaml = files.filter((f) => f.endsWith('.yaml') && f !== CAPABILITY_ORDER_FILE_YAML);
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
                for (const capId of capOrder) {
                  const cap = caps[capId];
                  if (!cap) continue;
                  const capName = cap.name || capId;
                  for (const proj of cap.projects) {
                    if (projectId && proj.id !== projectId) continue;
                    const projectName = proj.name || proj.id;
                    const yamlPath = path.join(DATA_PROJECTS_DIR, `${proj.id}.yaml`);
                    let data: { teams?: Array<{ topics?: Array<{ subTopics?: Array<{ title: string; status: string }> }> }> } | null = null;
                    try {
                      if (fs.existsSync(yamlPath)) {
                        const yamlStr = fs.readFileSync(yamlPath, 'utf-8');
                        data = yamlToProject(yamlStr);
                      }
                    } catch {
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
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ critical, warning }));
              } catch (e) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: String(e) }));
              }
              return;
            }
            if (url === '/api/capability/save' && req.method === 'POST') {
              let body = '';
              req.on('data', (chunk) => { body += chunk; });
              req.on('end', () => {
                try {
                  const { layout } = JSON.parse(body);
                  if (!layout || !Array.isArray(layout.capOrder) || typeof layout.caps !== 'object') {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ ok: false, error: 'Invalid layout' }));
                    return;
                  }
                  fs.mkdirSync(DATA_CAPABILITY_DIR, { recursive: true });
                  fs.writeFileSync(path.join(DATA_CAPABILITY_DIR, CAPABILITY_ORDER_FILE_YAML), capOrderToYaml(layout.capOrder), 'utf-8');
                  for (const id of layout.capOrder) {
                    const cap = layout.caps[id];
                    if (cap) {
                      const safeId = safeCapId(id);
                      const filePath = path.join(DATA_CAPABILITY_DIR, `${safeId}.yaml`);
                      fs.writeFileSync(filePath, capToYaml(cap), 'utf-8');
                    }
                  }
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ ok: true }));
                } catch (e) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ ok: false, error: String(e) }));
                }
              });
              return;
            }
            next();
          });
        },
      },
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: {
        // ไม่ให้ Vite dev server trigger reload เมื่อแก้ไฟล์ใน data/
        ignored: ['**/data/**'],
      },
    },
  };
});
