import fs from 'fs';
import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig, loadEnv} from 'vite';

import {importFromMarkdown} from './src/lib/projectMarkdown';
import {yamlToProject, projectToYaml} from './src/lib/projectYaml';
import {nameToId, sanitizeId} from './src/lib/idUtils';
import {markdownToOrgTeam} from './src/lib/teamMarkdown';
import {yamlToOrgTeam, orgTeamToYaml} from './src/lib/teamYaml';
import {markdownToCab, orderMarkdownToCabIds} from './src/lib/cabilityMarkdown';
import {yamlToCab, cabToYaml, yamlToCabOrder, cabOrderToYaml} from './src/lib/cabilityYaml';

const DATA_PROJECTS_DIR = path.resolve(__dirname, 'data', 'projects');
const DATA_TEAMS_DIR = path.resolve(__dirname, 'data', 'teams');
const DATA_CABILITY_DIR = path.resolve(__dirname, 'data', 'cability');
const CABILITY_ORDER_FILE_MD = '_order.md';
const CABILITY_ORDER_FILE_YAML = '_order.yaml';

function safeTeamId(id: string): string {
  return id.replace(/[^a-zA-Z0-9-_]/g, '') || 'team';
}

function safeCabId(id: string): string {
  return id.replace(/[^a-zA-Z0-9-_]/g, '') || 'cab';
}

/** Resolve project id to file path: exact match then case-insensitive stem (ชื่อไฟล์ = ตัวเล็ก + _) */
function resolveProjectPath(projId: string): { path: string; ext: 'yaml' | 'md' } | null {
  const exactYaml = path.join(DATA_PROJECTS_DIR, `${projId}.yaml`);
  const exactMd = path.join(DATA_PROJECTS_DIR, `${projId}.md`);
  if (fs.existsSync(exactYaml)) return { path: exactYaml, ext: 'yaml' };
  if (fs.existsSync(exactMd)) return { path: exactMd, ext: 'md' };
  const lowerId = projId.toLowerCase().replace(/[^a-z0-9_]/g, '');
  const files = fs.readdirSync(DATA_PROJECTS_DIR);
  for (const f of files) {
    const stem = f.endsWith('.yaml') ? f.slice(0, -5) : f.endsWith('.md') ? f.slice(0, -3) : null;
    if (stem && stem.toLowerCase() === lowerId) {
      if (f.endsWith('.yaml')) return { path: path.join(DATA_PROJECTS_DIR, f), ext: 'yaml' };
      if (f.endsWith('.md')) return { path: path.join(DATA_PROJECTS_DIR, f), ext: 'md' };
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
                const data = resolved.ext === 'yaml' ? yamlToProject(content) : importFromMarkdown(content);
                const outId = (data && (data as { id?: string }).id) || path.basename(resolved.path, resolved.ext === 'yaml' ? '.yaml' : '.md');
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
              const addFromFile = (f: string, id: string, content: string, isYaml: boolean) => {
                if (seenIds.has(id)) return;
                seenIds.add(id);
                let name = id;
                let summaryStatus: 'RED' | 'YELLOW' | 'GREEN' | null = null;
                let description: string | null = null;
                try {
                  if (isYaml) {
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
                  } else {
                    const lines = content.split(/\r?\n/);
                    const h1 = lines.find((l) => /^#\s+.+/.test(l));
                    if (h1) name = h1.replace(/^#\s+/, '').trim();
                    const statusMatch = content.match(/\((RED|YELLOW|GREEN)\)/g);
                    if (statusMatch && statusMatch.length > 0) {
                      if (statusMatch.some((s) => s === '(RED)')) summaryStatus = 'RED';
                      else if (statusMatch.some((s) => s === '(YELLOW)')) summaryStatus = 'YELLOW';
                      else summaryStatus = 'GREEN';
                    }
                  }
                } catch (_) {}
                list.push({ id, name, description, summaryStatus });
              };
              const yamlFiles = files.filter((f) => f.endsWith('.yaml'));
              const mdFiles = files.filter((f) => f.endsWith('.md'));
              for (const f of yamlFiles) {
                const id = f.slice(0, -5);
                const filePath = path.join(DATA_PROJECTS_DIR, f);
                addFromFile(f, id, fs.readFileSync(filePath, 'utf-8'), true);
              }
              for (const f of mdFiles) {
                const id = f.slice(0, -3);
                const filePath = path.join(DATA_PROJECTS_DIR, f);
                addFromFile(f, id, fs.readFileSync(filePath, 'utf-8'), false);
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
                const { projectName, data, markdown } = JSON.parse(body);
                const name = (projectName || 'project').trim();
                fs.mkdirSync(DATA_PROJECTS_DIR, { recursive: true });
                let payload: { id?: string; projectName: string; teams: unknown[] };
                if (data != null && typeof data === 'object' && Array.isArray(data.teams)) {
                  payload = {
                    id: typeof data.id === 'string' ? data.id.trim() : undefined,
                    projectName: data.projectName ?? name,
                    teams: data.teams,
                  };
                } else if (typeof markdown === 'string') {
                  const imported = importFromMarkdown(markdown);
                  payload = { projectName: imported.projectName, teams: imported.teams };
                } else {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ ok: false, error: 'Missing data or markdown' }));
                  return;
                }
                const fileId = sanitizeId(payload.id || '') || sanitizeId(nameToId(payload.projectName)) || 'project';
                const toWrite = projectToYaml({
                  id: fileId,
                  projectName: payload.projectName,
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
                const mdFiles = files.filter((f) => f.endsWith('.md'));
                const ids = new Set<string>();
                for (const f of yamlFiles) ids.add(f.slice(0, -5));
                for (const f of mdFiles) ids.add(f.slice(0, -3));
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
              const mdPath = path.join(DATA_TEAMS_DIR, `${id}.md`);
              try {
                let data: { id: string; name: string; owner: string; parentId: string | null; childIds: string[] };
                if (fs.existsSync(yamlPath)) {
                  const yamlStr = fs.readFileSync(yamlPath, 'utf-8');
                  data = yamlToOrgTeam(id, yamlStr);
                } else if (fs.existsSync(mdPath)) {
                  const md = fs.readFileSync(mdPath, 'utf-8');
                  data = markdownToOrgTeam(id, md);
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
                  const { id, data, markdown } = JSON.parse(body);
                  const safeId = safeTeamId(String(id || 'team'));
                  fs.mkdirSync(DATA_TEAMS_DIR, { recursive: true });
                  const filePath = path.join(DATA_TEAMS_DIR, `${safeId}.yaml`);
                  let toWrite: string;
                  if (data != null && typeof data === 'object' && 'name' in data) {
                    toWrite = orgTeamToYaml({ ...data, id: safeId });
                  } else if (typeof markdown === 'string') {
                    toWrite = orgTeamToYaml(markdownToOrgTeam(safeId, markdown));
                  } else {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ ok: false, error: 'Missing data or markdown' }));
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
        name: 'cability-api',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            const url = req.url?.split('?')[0] ?? '';
            if (url === '/api/cability' && req.method === 'GET') {
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
                const cabs: Record<string, { id: string; name: string; cols?: 12 | 6 | 4 | 3; projects: Array<{ id: string; name: string; status?: string; cols?: 12 | 6 | 4 | 3 }> }> = {};
                const files = fs.readdirSync(DATA_CABILITY_DIR);
                const cabFilesYaml = files.filter((f) => f.endsWith('.yaml') && f !== CABILITY_ORDER_FILE_YAML);
                const cabFilesMd = files.filter((f) => f.endsWith('.md') && f !== CABILITY_ORDER_FILE_MD);
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
                    cabs[id] = { id: safeCabId(id), name: id, cols: 4, projects: [] };
                  }
                }
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ layout: { cabOrder, cabs } }));
              } catch (e) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: String(e) }));
              }
              return;
            }
            if (url === '/api/cability/summary' && req.method === 'GET') {
              try {
                const projectId = (req.url?.includes('?') ? new URLSearchParams(req.url.slice(req.url.indexOf('?') + 1)).get('projectId') : null)?.trim() || undefined;
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
                const cabs: Record<string, { id: string; name: string; projects: Array<{ id: string; name: string }> }> = {};
                const files = fs.readdirSync(DATA_CABILITY_DIR);
                const cabFilesYaml = files.filter((f) => f.endsWith('.yaml') && f !== CABILITY_ORDER_FILE_YAML);
                const cabFilesMd = files.filter((f) => f.endsWith('.md') && f !== CABILITY_ORDER_FILE_MD);
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
                for (const cabId of cabOrder) {
                  const cab = cabs[cabId];
                  if (!cab) continue;
                  const cabName = cab.name || cabId;
                  for (const proj of cab.projects) {
                    if (projectId && proj.id !== projectId) continue;
                    const projectName = proj.name || proj.id;
                    const yamlPath = path.join(DATA_PROJECTS_DIR, `${proj.id}.yaml`);
                    const mdPath = path.join(DATA_PROJECTS_DIR, `${proj.id}.md`);
                    let data: { teams?: Array<{ topics?: Array<{ subTopics?: Array<{ title: string; status: string }> }> }> } | null = null;
                    try {
                      if (fs.existsSync(yamlPath)) {
                        const yamlStr = fs.readFileSync(yamlPath, 'utf-8');
                        data = yamlToProject(yamlStr);
                      } else if (fs.existsSync(mdPath)) {
                        const md = fs.readFileSync(mdPath, 'utf-8');
                        data = importFromMarkdown(md);
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
                            critical.push({ cabName, projectName, taskName: title });
                          } else if (status === 'YELLOW') {
                            warning.push({ cabName, projectName, taskName: title });
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
            if (url === '/api/cability/save' && req.method === 'POST') {
              let body = '';
              req.on('data', (chunk) => { body += chunk; });
              req.on('end', () => {
                try {
                  const { layout } = JSON.parse(body);
                  if (!layout || !Array.isArray(layout.cabOrder) || typeof layout.cabs !== 'object') {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ ok: false, error: 'Invalid layout' }));
                    return;
                  }
                  fs.mkdirSync(DATA_CABILITY_DIR, { recursive: true });
                  fs.writeFileSync(path.join(DATA_CABILITY_DIR, CABILITY_ORDER_FILE_YAML), cabOrderToYaml(layout.cabOrder), 'utf-8');
                  for (const id of layout.cabOrder) {
                    const cab = layout.cabs[id];
                    if (cab) {
                      const safeId = safeCabId(id);
                      const filePath = path.join(DATA_CABILITY_DIR, `${safeId}.yaml`);
                      fs.writeFileSync(filePath, cabToYaml(cab), 'utf-8');
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
