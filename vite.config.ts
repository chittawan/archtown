import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig, loadEnv} from 'vite';

import {yamlToProject, projectToYaml} from './src/lib/projectYaml';
import {nameToId, sanitizeId} from './src/lib/idUtils';
import {yamlToOrgTeam, orgTeamToYaml} from './src/lib/teamYaml';
import {yamlToCap, capToYaml, yamlToCapOrder, capOrderToYaml} from './src/lib/capabilityYaml';
import {buildAIContextMarkdown} from './server/services/aiContextMarkdown';

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
    optimizeDeps: {
      exclude: ['@sqlite.org/sqlite-wasm'],
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'auth-token-api',
        configureServer(server) {
          const DATA_ROOT = path.resolve(__dirname, 'data');
          const AUTH_DIR = path.join(DATA_ROOT, 'auth');
          const TOKENS_FILE = path.join(AUTH_DIR, 'tokens.json');

          type StoredToken = {
            id: string;
            tokenHash: string;
            googleId: string;
            createdAt: string;
            expiresAt: string | null;
          };
          type TokenStore = { version: 1; tokens: StoredToken[] };

          const sanitizeGoogleId = (raw: string) => String(raw || '').replace(/[^a-zA-Z0-9_.-]/g, '');
          const sha256Hex = (input: string) => crypto.createHash('sha256').update(input, 'utf8').digest('hex');
          const safeEqualHex = (a: string, b: string) => {
            const aa = Buffer.from(a, 'hex');
            const bb = Buffer.from(b, 'hex');
            if (aa.length !== bb.length) return false;
            return crypto.timingSafeEqual(aa, bb);
          };
          const parseExpiresAt = (expiresAt: unknown): string | null => {
            if (expiresAt == null || expiresAt === '') return null;
            if (typeof expiresAt !== 'string') return null;
            const d = new Date(expiresAt);
            if (Number.isNaN(d.getTime())) return null;
            return d.toISOString();
          };
          const readTokenStore = (): TokenStore => {
            try {
              if (!fs.existsSync(TOKENS_FILE)) return { version: 1, tokens: [] };
              const raw = fs.readFileSync(TOKENS_FILE, 'utf-8');
              const parsed = JSON.parse(raw) as Partial<TokenStore>;
              if (parsed.version !== 1 || !Array.isArray(parsed.tokens)) return { version: 1, tokens: [] };
              return { version: 1, tokens: parsed.tokens as StoredToken[] };
            } catch {
              return { version: 1, tokens: [] };
            }
          };
          const writeTokenStore = (store: TokenStore) => {
            fs.mkdirSync(path.dirname(TOKENS_FILE), { recursive: true });
            fs.writeFileSync(TOKENS_FILE, JSON.stringify(store, null, 2), 'utf-8');
          };
          const requireAdminKeyIfConfigured = (req: { headers?: Record<string, string | string[] | undefined> }, res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (s: string) => void; }) => {
            const configured = process.env.ARCHTOWN_ADMIN_KEY;
            if (!configured) return true;
            const got = (req.headers?.['x-admin-key'] as string) || '';
            if (got && got === configured) return true;
            res.statusCode = 401;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
            return false;
          };

          server.middlewares.use(async (req, res, next) => {
            const url = req.url?.split('?')[0] ?? '';

            if (url === '/api/auth/token/generate' && req.method === 'POST') {
              let body = '';
              req.on('data', (chunk) => { body += chunk; });
              req.on('end', () => {
                try {
                  if (!requireAdminKeyIfConfigured(req, res)) return;

                  const parsed = JSON.parse(body || '{}') as { googleId?: string; expiresAt?: unknown };
                  const googleId = sanitizeGoogleId(parsed.googleId || '');
                  if (!googleId) {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ ok: false, error: 'googleId is required' }));
                    return;
                  }

                  const expiresAt = parseExpiresAt(parsed.expiresAt);
                  const token = `atkn_${crypto.randomBytes(24).toString('base64url')}`;
                  const tokenHash = sha256Hex(token);

                  const store = readTokenStore();
                  const record: StoredToken = {
                    id: crypto.randomUUID(),
                    tokenHash,
                    googleId,
                    createdAt: new Date().toISOString(),
                    expiresAt,
                  };
                  store.tokens.push(record);
                  writeTokenStore(store);

                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ ok: true, token, googleId, expiresAt }));
                } catch (e) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ ok: false, error: String(e) }));
                }
              });
              return;
            }

            if (url === '/api/auth/token/login' && req.method === 'POST') {
              let body = '';
              req.on('data', (chunk) => { body += chunk; });
              req.on('end', () => {
                try {
                  const parsed = JSON.parse(body || '{}') as { token?: string };
                  const token = String(parsed.token || '').trim();
                  if (!token) {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ ok: false, error: 'token is required' }));
                    return;
                  }
                  const tokenHash = sha256Hex(token);
                  const store = readTokenStore();
                  const match = store.tokens.find((t) => {
                    try {
                      return safeEqualHex(t.tokenHash, tokenHash);
                    } catch {
                      return false;
                    }
                  });
                  if (!match) {
                    res.statusCode = 401;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ ok: false, error: 'invalid token' }));
                    return;
                  }
                  if (match.expiresAt) {
                    const exp = new Date(match.expiresAt).getTime();
                    if (!Number.isNaN(exp) && Date.now() > exp) {
                      res.statusCode = 401;
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify({ ok: false, error: 'token expired' }));
                      return;
                    }
                  }
                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ ok: true, googleId: match.googleId, expiresAt: match.expiresAt }));
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
                const caps: Record<string, import('./src/lib/capabilityYaml').Cap> = {};
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
                const caps: Record<string, { id: string; name: string; projects: Array<{ id: string; name?: string }> }> = {};
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
      {
        name: 'sync-api',
        configureServer(server) {
          const SYNC_DIR = path.resolve(__dirname, 'data', 'sync');
          function getSyncUserId(incomingReq: { url?: string; headers?: Record<string, string | string[] | undefined> }): string {
            const raw = (incomingReq.headers?.['x-google-user-id'] as string) ||
              (incomingReq.url?.includes('userId=') ? new URLSearchParams(incomingReq.url.slice(incomingReq.url.indexOf('?'))).get('userId') || '' : '');
            const safe = String(raw).replace(/[^a-zA-Z0-9_.-]/g, '');
            return safe || 'guest';
          }
          function getSyncBackupPath(userId: string) {
            return path.join(SYNC_DIR, userId, 'backup.json');
          }
          server.middlewares.use(async (req, res, next) => {
            const url = req.url?.split('?')[0] ?? '';
            if (url === '/api/sync/download' && req.method === 'GET') {
              try {
                const userId = getSyncUserId(req);
                const backupFile = getSyncBackupPath(userId);
                if (!fs.existsSync(backupFile)) {
                  res.statusCode = 404;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'ยังไม่มีข้อมูลบน Cloud' }));
                  return;
                }
                const json = fs.readFileSync(backupFile, 'utf-8');
                res.setHeader('Content-Type', 'application/json');
                res.end(json);
              } catch (e) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: String(e) }));
              }
              return;
            }
            if (url === '/api/sync/upload' && req.method === 'POST') {
              let body = '';
              req.on('data', (chunk) => { body += chunk; });
              req.on('end', () => {
                try {
                  const payload = JSON.parse(body || '{}');
                  const isPlain = payload?.schema_version != null && payload?.tables != null;
                  const isEncrypted = typeof payload?.enc === 'string' && typeof payload?.iv === 'string' && typeof payload?.salt === 'string';
                  if (!payload || typeof payload !== 'object' || (!isPlain && !isEncrypted)) {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ ok: false, error: 'รูปแบบข้อมูลไม่ถูกต้อง' }));
                    return;
                  }
                  const userId = getSyncUserId(req);
                  const backupFile = getSyncBackupPath(userId);
                  const query = req.url?.includes('?') ? new URLSearchParams(req.url.slice(req.url.indexOf('?'))) : null;
                  const force = query?.get('force') === '1' || query?.get('force') === 'true' || payload.force === true;
                  if (!force && fs.existsSync(backupFile)) {
                    const existingJson = fs.readFileSync(backupFile, 'utf-8');
                    let existing: { version?: number; updated_at?: string };
                    try {
                      existing = JSON.parse(existingJson);
                    } catch {
                      existing = {};
                    }
                    const serverVersion = existing.version ?? 0;
                    const payloadVersion = payload.version ?? 0;
                    if (payloadVersion <= serverVersion) {
                      res.statusCode = 409;
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify({
                        ok: false,
                        error: 'Cloud มีข้อมูลใหม่กว่า',
                        conflict: true,
                        remoteVersion: serverVersion,
                        remoteUpdatedAt: existing.updated_at ?? null,
                      }));
                      return;
                    }
                  }
                  fs.mkdirSync(path.dirname(backupFile), { recursive: true });
                  const { force: _f, ...payloadToWrite } = payload;
                  fs.writeFileSync(backupFile, JSON.stringify(payloadToWrite), 'utf-8');
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
      {
        name: 'ai-context-api',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            const url = req.url?.split('?')[0] ?? '';
            if (url === '/api/ai/context' && req.method === 'GET') {
              const host = req.headers.host || 'localhost:3000';
              const base = `http://${host}`;
              res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
              res.end(buildAIContextMarkdown(base));
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
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: {
        ignored: ['**/data/**'],
      },
    },
  };
});
