import fs from 'fs';
import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig, loadEnv} from 'vite';

const DATA_PROJECTS_DIR = path.resolve(__dirname, 'data', 'projects');
const DATA_TEAMS_DIR = path.resolve(__dirname, 'data', 'teams');
const DATA_CABILITY_DIR = path.resolve(__dirname, 'data', 'cability');
const CABILITY_ORDER_FILE = '_order.md';

function safeTeamId(id: string): string {
  return id.replace(/[^a-zA-Z0-9-_]/g, '') || 'team';
}

function safeCabId(id: string): string {
  return id.replace(/[^a-zA-Z0-9-_]/g, '') || 'cab';
}

// Cability layout: parse/serialize to match src/lib/cabilityMarkdown.ts
const PROJECTS_HEADER = '## Projects';
function cabToMarkdown(cab: { id: string; name: string; cols?: 12 | 6 | 4 | 3; projects: Array<{ id: string; name: string; status?: string; cols?: 12 | 6 | 4 | 3 }> }): string {
  const lines = [`# ${(cab.name || '').trim() || 'Cab'}`];
  if (cab.cols && [12, 6, 4, 3].includes(cab.cols)) {
    lines.push(`Cols: ${cab.cols}`);
  }
  lines.push('');
  if (cab.projects.length > 0) {
    lines.push(PROJECTS_HEADER);
    for (const p of cab.projects) {
      const parts: string[] = [p.id, p.name];
      if (p.status) parts.push(p.status);
      if (p.cols && [12, 6, 4, 3].includes(p.cols)) {
        while (parts.length < 3) parts.push('');
        parts.push(String(p.cols));
      }
      const part = parts.join('|');
      lines.push(`- ${part}`);
    }
  }
  return lines.join('\n').trimEnd();
}
function markdownToCab(id: string, md: string): { id: string; name: string; cols?: 12 | 6 | 4 | 3; projects: Array<{ id: string; name: string; status?: string; cols?: 12 | 6 | 4 | 3 }> } {
  const lines = md.split(/\r?\n/).map((l) => l.trimEnd());
  let name = 'Cab';
  let cols: 12 | 6 | 4 | 3 | undefined;
  const projects = [];
  let inProjects = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h1 = line.match(/^#\s+(.+)$/);
    const colsMatch = line.match(/^Cols:\s*(\d+)\s*$/);
    if (h1) { name = h1[1].trim(); inProjects = false; continue; }
    if (colsMatch) {
      const n = Number(colsMatch[1]);
      if (n === 12 || n === 6 || n === 4 || n === 3) cols = n;
      continue;
    }
    if (line === PROJECTS_HEADER) { inProjects = true; continue; }
    const bullet = line.match(/^-\s+(.+)$/);
    if (inProjects && bullet) {
      const raw = bullet[1].trim();
      const parts = raw.split('|').map((s) => s.trim());
      const projectId = parts[0] || '';
      const projectName = parts[1] ?? projectId;
      const status = parts[2];
      const colsRaw = parts[3];
      let projCols: 12 | 6 | 4 | 3 | undefined;
      const n = Number(colsRaw);
      if (n === 12 || n === 6 || n === 4 || n === 3) projCols = n;
      if (projectId) {
        projects.push({
          id: projectId,
          name: projectName,
          status: status === 'RED' || status === 'YELLOW' || status === 'GREEN' ? status : undefined,
          cols: projCols,
        });
      }
    }
  }
  return { id: safeCabId(id), name, cols, projects };
}
function orderMarkdownToCabIds(md: string): string[] {
  return md.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}
function cabIdsToOrderMarkdown(cabOrder: string[]): string {
  return cabOrder.filter(Boolean).join('\n');
}

function toCamelCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((word, i) =>
      i === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join('');
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
              const safeId = rawId.replace(/[^a-zA-Z0-9-_]/g, '') || 'project';
              const filePath = path.join(DATA_PROJECTS_DIR, `${safeId}.md`);
              try {
                if (!fs.existsSync(filePath)) {
                  res.statusCode = 404;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'Not found' }));
                  return;
                }
                const markdown = fs.readFileSync(filePath, 'utf-8');
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ id: safeId, markdown }));
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
              const list: Array<{ id: string; name: string; summaryStatus: 'RED' | 'YELLOW' | 'GREEN' | null }> = [];
              for (const f of files) {
                if (!f.endsWith('.md')) continue;
                const id = f.slice(0, -3);
                const filePath = path.join(DATA_PROJECTS_DIR, f);
                let name = id;
                let summaryStatus: 'RED' | 'YELLOW' | 'GREEN' | null = null;
                try {
                  const md = fs.readFileSync(filePath, 'utf-8');
                  const lines = md.split(/\r?\n/);
                  const h1 = lines.find((l) => /^#\s+.+/.test(l));
                  if (h1) name = h1.replace(/^#\s+/, '').trim();
                  const statusMatch = md.match(/\((RED|YELLOW|GREEN)\)/g);
                  if (statusMatch && statusMatch.length > 0) {
                    if (statusMatch.some((s) => s === '(RED)')) summaryStatus = 'RED';
                    else if (statusMatch.some((s) => s === '(YELLOW)')) summaryStatus = 'YELLOW';
                    else summaryStatus = 'GREEN';
                  }
                } catch (_) {}
                list.push({ id, name, summaryStatus });
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
                const { projectName, markdown } = JSON.parse(body);
                const name = (projectName || 'project').trim();
                const safeName = toCamelCase(name.replace(/[^\p{L}\p{N}\s_-]/gu, ' ').trim()) || 'project';
                fs.mkdirSync(DATA_PROJECTS_DIR, { recursive: true });
                const filePath = path.join(DATA_PROJECTS_DIR, `${safeName}.md`);
                fs.writeFileSync(filePath, markdown ?? '', 'utf-8');
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ ok: true, path: filePath }));
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
                const ids = files
                  .filter((f) => f.endsWith('.md'))
                  .map((f) => f.slice(0, -3));
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ ids }));
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
              const filePath = path.join(DATA_TEAMS_DIR, `${id}.md`);
              try {
                if (!fs.existsSync(filePath)) {
                  res.statusCode = 404;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'Not found' }));
                  return;
                }
                const markdown = fs.readFileSync(filePath, 'utf-8');
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ id, markdown }));
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
                  const { id, markdown } = JSON.parse(body);
                  const safeId = safeTeamId(String(id || 'team'));
                  fs.mkdirSync(DATA_TEAMS_DIR, { recursive: true });
                  const filePath = path.join(DATA_TEAMS_DIR, `${safeId}.md`);
                  fs.writeFileSync(filePath, markdown ?? '', 'utf-8');
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
                const orderPath = path.join(DATA_CABILITY_DIR, CABILITY_ORDER_FILE);
                let cabOrder = [];
                if (fs.existsSync(orderPath)) {
                  cabOrder = orderMarkdownToCabIds(fs.readFileSync(orderPath, 'utf-8'));
                }
                const cabs = {};
                const files = fs.readdirSync(DATA_CABILITY_DIR);
                const cabFiles = files.filter((f) => f.endsWith('.md') && f !== CABILITY_ORDER_FILE);
                const seen = new Set(cabOrder);
                for (const f of cabFiles) {
                  const id = f.slice(0, -3);
                  if (!seen.has(id)) cabOrder.push(id);
                }
                for (const id of cabOrder) {
                  const filePath = path.join(DATA_CABILITY_DIR, `${id}.md`);
                  if (fs.existsSync(filePath)) {
                    const md = fs.readFileSync(filePath, 'utf-8');
                    cabs[id] = markdownToCab(id, md);
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
                  fs.writeFileSync(path.join(DATA_CABILITY_DIR, CABILITY_ORDER_FILE), cabIdsToOrderMarkdown(layout.cabOrder), 'utf-8');
                  for (const id of layout.cabOrder) {
                    const cab = layout.cabs[id];
                    if (cab) {
                      const safeId = safeCabId(id);
                      const filePath = path.join(DATA_CABILITY_DIR, `${safeId}.md`);
                      fs.writeFileSync(filePath, cabToMarkdown(cab), 'utf-8');
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
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
