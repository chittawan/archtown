/**
 * Production server: serve static dist/ + Cloud Sync API เท่านั้น
 *
 * แอปใช้ SQLite WASM ในเบราว์เซอร์ — ไม่ได้เรียก API อื่น
 * Server จำเป็นเฉพาะเมื่อต้องการฟีเจอร์ "Sync กับ Cloud" (อัปโหลด/ดาวน์โหลด backup)
 *
 * ถ้าไม่ใช้ Cloud Sync: deploy แค่โฟลเดอร์ dist/ บน static host (Vercel, Netlify, nginx) ก็พอ
 */
import express from 'express';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DATA_ROOT = path.join(process.cwd(), 'data');
const SYNC_DIR = path.join(DATA_ROOT, 'sync');
const AUTH_DIR = path.join(DATA_ROOT, 'auth');
const TOKENS_FILE = path.join(AUTH_DIR, 'tokens.json');

/** Sanitize Google user id for use as directory name (ป้องกัน path traversal). */
function getSyncUserId(req: express.Request): string {
  const raw = (req.headers['x-google-user-id'] as string) || (req.query.userId as string) || '';
  const safe = raw.replace(/[^a-zA-Z0-9_.-]/g, '');
  return safe || 'guest';
}

function getSyncBackupPath(userId: string): string {
  return path.join(SYNC_DIR, userId, 'backup.json');
}

function sanitizeGoogleId(raw: string): string {
  const safe = (raw || '').replace(/[^a-zA-Z0-9_.-]/g, '');
  return safe;
}

type TokenScope = 'read' | 'write';

type StoredToken = {
  id: string;
  tokenHash: string;
  googleId: string;
  createdAt: string;
  expiresAt: string | null;
  scope: TokenScope;
};

type TokenStore = { version: 1; tokens: StoredToken[] };

function readTokenStore(): TokenStore {
  try {
    if (!fs.existsSync(TOKENS_FILE)) return { version: 1, tokens: [] };
    const raw = fs.readFileSync(TOKENS_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<TokenStore>;
    if (parsed.version !== 1 || !Array.isArray(parsed.tokens)) return { version: 1, tokens: [] };
    const tokens = (parsed.tokens as Partial<StoredToken>[]).map((t) => {
      const scope = t.scope === 'read' || t.scope === 'write' ? t.scope : 'write'; // back-compat with old tokens.json
      return { ...(t as StoredToken), scope };
    });
    return { version: 1, tokens };
  } catch {
    return { version: 1, tokens: [] };
  }
}

function writeTokenStore(store: TokenStore): void {
  fs.mkdirSync(path.dirname(TOKENS_FILE), { recursive: true });
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  const aa = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function parseExpiresAt(expiresAt: unknown): string | null {
  if (expiresAt == null || expiresAt === '') return null;
  if (typeof expiresAt !== 'string') return null;
  const d = new Date(expiresAt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function parseRequestedTokenScope(raw: unknown): TokenScope {
  if (raw === undefined || raw === null || raw === '') return 'write';
  if (raw === 'read' || raw === 'write') return raw;
  throw new Error('Invalid token scope. Use "read" or "write".');
}

const app = express();

// OPFS (SQLite WASM) ต้องใช้ SharedArrayBuffer — ต้องส่ง COOP/COEP เพื่อให้เบราว์เซอร์เปิดใช้ได้
// ถ้าไม่มี header เหล่านี้ รัน Docker (หรือ production) จะได้แค่ IndexedDB fallback แทน OPFS
app.use((_req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

app.use(express.json({ limit: '10mb' }));

// --- AI Login Token API ---
function requireAdminKeyIfConfigured(req: express.Request, res: express.Response): boolean {
  const configured = process.env.ARCHTOWN_ADMIN_KEY;
  if (!configured) return true;
  const got = (req.headers['x-admin-key'] as string) || '';
  if (got && got === configured) return true;
  res.status(401).json({ ok: false, error: 'unauthorized' });
  return false;
}

app.post('/api/auth/token/generate', (req, res) => {
  try {
    if (!requireAdminKeyIfConfigured(req, res)) return;

    const rawGoogleId = (req.body?.googleId as string) || '';
    const googleId = sanitizeGoogleId(rawGoogleId);
    if (!googleId) {
      res.status(400).json({ ok: false, error: 'googleId is required' });
      return;
    }

    const expiresAt = parseExpiresAt(req.body?.expiresAt);
    const scope = parseRequestedTokenScope(req.body?.scope);
    const token = `atkn_${crypto.randomBytes(24).toString('base64url')}`;
    const tokenHash = sha256Hex(token);

    const store = readTokenStore();
    const record: StoredToken = {
      id: crypto.randomUUID(),
      tokenHash,
      googleId,
      createdAt: new Date().toISOString(),
      expiresAt,
      scope,
    };
    store.tokens.push(record);
    writeTokenStore(store);

    res.json({ ok: true, token, googleId, expiresAt, scope });
  } catch (e) {
    const msg = String(e);
    res.status(msg.toLowerCase().includes('invalid token scope') ? 400 : 500).json({ ok: false, error: msg });
  }
});

app.post('/api/auth/token/login', (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    if (!token) {
      res.status(400).json({ ok: false, error: 'token is required' });
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
      res.status(401).json({ ok: false, error: 'invalid token' });
      return;
    }
    if (match.expiresAt) {
      const exp = new Date(match.expiresAt).getTime();
      if (!Number.isNaN(exp) && Date.now() > exp) {
        res.status(401).json({ ok: false, error: 'token expired' });
        return;
      }
    }
    res.json({ ok: true, googleId: match.googleId, expiresAt: match.expiresAt, scope: match.scope });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

type SyncAuth = { tokenHash: string; googleId: string; scope: TokenScope };

declare global {
  namespace Express {
    interface Request {
      syncAuth?: SyncAuth;
    }
  }
}

function extractTokenFromRequest(req: express.Request): string | null {
  const auth = req.headers['authorization'];
  if (typeof auth === 'string') {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m) return m[1].trim();
  }
  const x = req.headers['x-archtown-token'] ?? req.headers['x-token'];
  if (typeof x === 'string') {
    const t = x.trim();
    return t ? t : null;
  }
  return null;
}

function verifySyncToken(token: string): SyncAuth {
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
    const err = new Error('invalid token');
    (err as any).status = 401;
    throw err;
  }
  if (match.expiresAt) {
    const exp = new Date(match.expiresAt).getTime();
    if (!Number.isNaN(exp) && Date.now() > exp) {
      const err = new Error('token expired');
      (err as any).status = 401;
      throw err;
    }
  }
  return { tokenHash: match.tokenHash, googleId: match.googleId, scope: match.scope };
}

const syncRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  keyGenerator: (req) => {
    if (req.syncAuth) return `token:${req.syncAuth.tokenHash}`;
    const userId = getSyncUserId(req);
    return `google:${userId}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ ok: false, error: 'rate limit exceeded' }),
});

async function readBackupVersionAndUpdatedAt(
  backupFile: string,
): Promise<{ version: number; updated_at: string | null } | null> {
  return await new Promise((resolve, reject) => {
    if (!fs.existsSync(backupFile)) return resolve(null);

    const stream = fs.createReadStream(backupFile, { encoding: 'utf8', highWaterMark: 64 * 1024 });
    let buf = '';
    let version: number | null = null;
    let updatedAtFound = false;
    let updated_at: string | null = null;

    const cleanup = () => {
      try {
        stream.destroy();
      } catch {
        /* ignore */
      }
    };

    const tryExtract = () => {
      if (version == null) {
        const m = buf.match(/"version"\s*:\s*(\d+)/);
        if (m) version = Number(m[1]);
      }
      if (!updatedAtFound) {
        // Match either "updated_at":"..." or "updated_at":null
        const mNull = buf.match(/"updated_at"\s*:\s*null/);
        if (mNull) {
          updated_at = null;
          updatedAtFound = true;
        }
        const mStr = buf.match(/"updated_at"\s*:\s*"([^"]*)"/);
        if (mStr) {
          updated_at = mStr[1];
          updatedAtFound = true;
        }
      }
      if (version != null && updatedAtFound) {
        cleanup();
        resolve({ version: version ?? 0, updated_at });
        return true;
      }
      return false;
    };

    stream.on('data', (chunk) => {
      buf += chunk;
      // keep memory bounded; metadata should be near the top
      if (buf.length > 300_000) buf = buf.slice(0, 150_000);
      tryExtract();
    });
    stream.on('error', (err) => reject(err));
    stream.on('end', () => {
      if (version == null) resolve(null);
      else resolve({ version: version ?? 0, updated_at: updatedAtFound ? updated_at : null });
    });
  });
}

// Optional token auth (token scope + token-key for rate limiting).
app.use(['/api/sync/download', '/api/sync/upload', '/api/sync/version', '/api/sync/patch'], (req, res, next) => {
  const token = extractTokenFromRequest(req);
  if (!token) return next();
  try {
    req.syncAuth = verifySyncToken(token);
    return next();
  } catch (e) {
    const status = (e as any)?.status ?? 401;
    const msg = String((e as any)?.message ?? e);
    return res.status(status).json({ ok: false, error: msg });
  }
});

app.use(['/api/sync/download', '/api/sync/upload', '/api/sync/version', '/api/sync/patch'], syncRateLimiter);

// --- Cloud Sync API (เก็บ/ดึง backup ต่อ user: data/sync/{googleId}/backup.json) ---
app.get('/api/sync/version', async (req, res) => {
  try {
    const tokenAuth = req.syncAuth;
    // download/version are read operations; both read/write scopes are allowed
    if (tokenAuth && tokenAuth.scope !== 'read' && tokenAuth.scope !== 'write') {
      res.status(403).json({ ok: false, error: 'insufficient scope' });
      return;
    }
    const userId = tokenAuth?.googleId ?? getSyncUserId(req);
    const backupFile = getSyncBackupPath(userId);
    const meta = await readBackupVersionAndUpdatedAt(backupFile);
    if (!meta) {
      res.status(404).json({ error: 'ยังไม่มีข้อมูลบน Cloud' });
      return;
    }
    res.json({ version: meta.version, updated_at: meta.updated_at });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get('/api/sync/download', (req, res) => {
  try {
    const tokenAuth = req.syncAuth;
    const userId = tokenAuth?.googleId ?? getSyncUserId(req);
    const backupFile = getSyncBackupPath(userId);
    if (!fs.existsSync(backupFile)) {
      res.status(404).json({ error: 'ยังไม่มีข้อมูลบน Cloud' });
      return;
    }
    const json = fs.readFileSync(backupFile, 'utf-8');
    res.setHeader('Content-Type', 'application/json');
    res.send(json);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

function normalizeIsoTimestamp(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string') return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function isSafeFieldKey(key: string): boolean {
  if (!key) return false;
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') return false;
  return /^[a-zA-Z0-9_]+$/.test(key);
}

type SyncPatchResponse = {
  ok: true;
  version: number;
  applied: number;
  rejected: Array<{ index: number; error: string }>;
} | { ok: false; error: string };

const TABLE_WHITELIST = new Set([
  'projects',
  'project_teams',
  'project_topics',
  'project_sub_topics',
  'project_sub_topic_details',
  'org_teams',
  'org_team_children',
  'capability_order',
  'caps',
  'cap_projects',
]);

app.patch('/api/sync/patch', (req, res) => {
  try {
    const tokenAuth = req.syncAuth;
    if (tokenAuth && tokenAuth.scope !== 'write') {
      res.status(403).json({ ok: false, error: 'insufficient scope' });
      return;
    }

    const payload = req.body;
    const baseVersion = payload?.base_version;
    const ops = payload?.ops;

    if (typeof baseVersion !== 'number' || !Array.isArray(ops)) {
      res.status(400).json({ ok: false, error: 'Invalid payload. Expect { base_version:number, ops:[] }' });
      return;
    }

    if (ops.length > 100) {
      res.status(400).json({ ok: false, error: 'ops limit exceeded (max 100)' });
      return;
    }

    const userId = tokenAuth?.googleId ?? getSyncUserId(req);
    const backupFile = getSyncBackupPath(userId);
    if (!fs.existsSync(backupFile)) {
      res.status(404).json({ error: 'ยังไม่มีข้อมูลบน Cloud' });
      return;
    }

    const json = fs.readFileSync(backupFile, 'utf-8');
    let backup: any;
    try {
      backup = JSON.parse(json) as any;
    } catch {
      res.status(500).json({ ok: false, error: 'backup.json parse error' });
      return;
    }

    const serverVersion = typeof backup?.version === 'number' ? backup.version : Number(backup?.version ?? 0);
    const versionBefore = typeof backup?.version === 'number' ? backup.version : serverVersion;
    if (baseVersion < serverVersion) {
      res.status(409).json({
        ok: false,
        error: 'base_version is older than server version',
        conflict: true,
        remoteVersion: serverVersion,
        remoteUpdatedAt: backup?.updated_at ?? null,
      });
      return;
    }

    const tables = (backup?.tables && typeof backup.tables === 'object') ? backup.tables : {};
    let applied = 0;
    const rejected: Array<{ index: number; error: string }> = [];

    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      try {
        const opType = op?.op;
        const table = op?.table;
        if (typeof opType !== 'string' || typeof table !== 'string') {
          throw new Error('op must include { op, table }');
        }
        if (!TABLE_WHITELIST.has(table)) {
          throw new Error(`Unknown table: ${table}`);
        }
        const tableRows = tables[table];
        if (!Array.isArray(tableRows)) {
          throw new Error(`Unknown table: ${table}`);
        }

        if (opType === 'update') {
          const id = op?.id;
          const fields = op?.fields;
          const fieldUpdatedAt = op?.field_updated_at;
          if (typeof id !== 'string' || !fields || typeof fields !== 'object') throw new Error('update requires { id:string, fields:object }');
          if (!fieldUpdatedAt || typeof fieldUpdatedAt !== 'object') throw new Error('update requires { field_updated_at:object }');

          const rowIndex = tableRows.findIndex((r) => r && typeof r === 'object' && (r as any).id === id);
          if (rowIndex === -1) throw new Error(`Row not found (id=${id})`);

          const row = tableRows[rowIndex];
          let changedAny = false;
          for (const [fieldKey, fieldValue] of Object.entries(fields as Record<string, unknown>)) {
            if (!isSafeFieldKey(fieldKey)) continue;
            const incomingRaw = (fieldUpdatedAt as Record<string, unknown>)[fieldKey];
            const incomingTs = normalizeIsoTimestamp(incomingRaw) ?? new Date().toISOString();

            const tsKey = `${fieldKey}_updated_at`;
            const existingRaw = (row as any)[tsKey];
            const existingTs = normalizeIsoTimestamp(existingRaw);

            // If existing field_updated_at is newer or equal, keep existing value.
            if (existingTs && normalizeIsoTimestamp(incomingTs) && new Date(existingTs).getTime() >= new Date(incomingTs).getTime()) {
              continue;
            }

            (row as any)[fieldKey] = fieldValue;
            (row as any)[tsKey] = incomingTs;
            changedAny = true;
          }

          // Consider update "applied" if row exists (even if no field changed).
          if (changedAny || Object.keys(fields as Record<string, unknown>).length > 0) applied++;
        } else if (opType === 'insert') {
          const row = op?.row;
          if (!row || typeof row !== 'object') throw new Error('insert requires { row:object }');
          const id = (row as any).id;
          if (typeof id !== 'string' || !id) throw new Error('insert row must include { id:string }');

          const exists = tableRows.some((r) => r && typeof r === 'object' && (r as any).id === id);
          if (exists) throw new Error(`Row already exists (id=${id})`);

          tableRows.push(row);
          applied++;
        } else if (opType === 'delete') {
          const id = op?.id;
          if (typeof id !== 'string' || !id) throw new Error('delete requires { id:string }');
          const idx = tableRows.findIndex((r) => r && typeof r === 'object' && (r as any).id === id);
          if (idx === -1) throw new Error(`Row not found (id=${id})`);
          tableRows.splice(idx, 1);
          applied++;
        } else {
          throw new Error(`Unknown op: ${String(opType)}`);
        }
      } catch (e) {
        rejected.push({ index: i, error: e instanceof Error ? e.message : String(e) });
      }
    }

    if (applied > 0) {
      backup.version = versionBefore + 1;
      backup.updated_at = new Date().toISOString();
      fs.writeFileSync(backupFile, JSON.stringify(backup), 'utf-8');
    }

    const auditFile = path.join(SYNC_DIR, userId, 'audit.log.jsonl');
    const auditLine = JSON.stringify({
      userId,
      ops,
      timestamp: new Date().toISOString(),
      result: { applied, rejected },
    });
    fs.mkdirSync(path.dirname(auditFile), { recursive: true });
    fs.appendFileSync(auditFile, auditLine + '\n', 'utf-8');

    const response: SyncPatchResponse = {
      ok: true,
      version: applied > 0 ? backup.version : versionBefore,
      applied,
      rejected,
    };
    res.json(response);
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

app.post('/api/sync/upload', (req, res) => {
  try {
    const payload = req.body;
    const isPlain = payload?.schema_version != null && payload?.tables != null;
    const isEncrypted = typeof payload?.enc === 'string' && typeof payload?.iv === 'string' && typeof payload?.salt === 'string';
    if (!payload || typeof payload !== 'object' || (!isPlain && !isEncrypted)) {
      res.status(400).json({ ok: false, error: 'รูปแบบข้อมูลไม่ถูกต้อง' });
      return;
    }
    if (req.syncAuth && req.syncAuth.scope !== 'write') {
      res.status(403).json({ ok: false, error: 'insufficient scope' });
      return;
    }
    const userId = req.syncAuth?.googleId ?? getSyncUserId(req);
    const backupFile = getSyncBackupPath(userId);
    const force = req.query.force === '1' || req.query.force === 'true' || payload.force === true;

    if (!force && fs.existsSync(backupFile)) {
      const existingJson = fs.readFileSync(backupFile, 'utf-8');
      let existing: { version?: number; updated_at?: string };
      try {
        existing = JSON.parse(existingJson) as { version?: number; updated_at?: string };
      } catch {
        existing = {};
      }
      const serverVersion = existing.version ?? 0;
      const payloadVersion = payload.version ?? 0;
      if (payloadVersion <= serverVersion) {
        res.status(409).json({
          ok: false,
          error: 'Cloud มีข้อมูลใหม่กว่า',
          conflict: true,
          remoteVersion: serverVersion,
          remoteUpdatedAt: existing.updated_at ?? null,
        });
        return;
      }
    }

    fs.mkdirSync(path.dirname(backupFile), { recursive: true });
    const { force: _f, ...payloadToWrite } = payload;
    fs.writeFileSync(backupFile, JSON.stringify(payloadToWrite), 'utf-8');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// --- AI Context (plain Markdown for AI agents to fetch) ---
app.get('/api/ai/context', (_req, res) => {
  const host = _req.headers.host || 'localhost';
  const proto = _req.headers['x-forwarded-proto'] || 'http';
  const base = `${proto}://${host}`;
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.send(buildAIContextMarkdown(base));
});

function buildAIContextMarkdown(baseUrl: string): string {
  return `# ArchTown — Open Claw AI Context

> API Reference & Learning Context for ArchTown
> Use this document to quickly access project data via API.

---

## Quick Reference — All Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/token/generate | Generate AI Login Token |
| POST | /api/auth/token/login | Login with Token → get userId |
| GET | /api/sync/download | Download full backup (JSON) |
| POST | /api/sync/upload | Upload backup (JSON) |
| GET | /api/sync/version | Get backup meta (version, updated_at) |
| PATCH | /api/sync/patch | Patch backup (field-level ops) |
| GET | /api/ai/context | This document (Markdown) |

Base URL: ${baseUrl}

---

## 1. Authentication — Token Login

ArchTown supports 2 login methods: **Google OAuth** and **AI Login Token**.
For AI agents, use Token to identify and access Cloud Sync.

### Flow
1. Admin generates Token via \`POST /api/auth/token/generate\` or UI \`/admin/generate-token\`
2. AI Agent logs in via \`POST /api/auth/token/login\`
3. Receives \`googleId\` → use as User ID for Cloud Sync
4. Pass \`X-Google-User-Id\` header (and \`Authorization: Bearer <token>\` to enforce token scope + per-token rate limit) in every Sync API call

### POST /api/auth/token/generate

\`\`\`
Request:
  POST ${baseUrl}/api/auth/token/generate
  Content-Type: application/json
  X-Admin-Key: <optional, only if ARCHTOWN_ADMIN_KEY is set>

  {
    "googleId": "107508959445697114581",
    "expiresAt": "2026-12-31T23:59:59Z",   // or null for no-expire
    "scope": "read" | "write"          // optional, default "write"
  }

Response 200:
  {
    "ok": true,
    "token": "atkn_<base64url_random>",
    "googleId": "107508959445697114581",
    "expiresAt": "2026-12-31T23:59:59.000Z"
  }

Error 401:
  { "ok": false, "error": "unauthorized" }
\`\`\`

### POST /api/auth/token/login

\`\`\`
Request:
  POST ${baseUrl}/api/auth/token/login
  Content-Type: application/json

  { "token": "atkn_<base64url_random>" }

Response 200:
  {
    "ok": true,
    "googleId": "107508959445697114581",
    "expiresAt": "2026-12-31T23:59:59.000Z"
  }

Error 401:
  { "ok": false, "error": "invalid token" }
  { "ok": false, "error": "token expired" }
\`\`\`

Security: Tokens are stored as SHA-256 hashes on server — cannot be recovered. Generate a new one if lost.

---

## 2. Cloud Sync — Download / Upload Backup

Cloud Sync backs up/restores all data from browser SQLite to server as JSON per user.

### Architecture
- Storage: \`data/sync/<userId>/backup.json\`
- User ID: header \`X-Google-User-Id\` or query \`?userId=\`, fallback \`guest\`
- Version conflict: server compares \`version\` — rejects if client ≤ server (409)
- Optional AES-GCM encryption (client-side)

### GET /api/sync/version

\`\`\`
Request:
  GET ${baseUrl}/api/sync/version
  X-Google-User-Id: YOUR_USER_ID
  Authorization: Bearer <token>   // optional (recommended for per-token rate limit + scope)

Response 200:
  { "version": 74, "updated_at": "2026-03-19T04:57:11.866Z" }

Error 404:
  { "error": "ยังไม่มีข้อมูลบน Cloud" }
\`\`\`

### GET /api/sync/download

\`\`\`
Request:
  GET ${baseUrl}/api/sync/download
  X-Google-User-Id: YOUR_USER_ID

Response 200 (plain backup):
  {
    "schema_version": 1,
    "version": 74,
    "updated_at": "2026-03-19T04:57:11.866Z",
    "tables": {
      "projects": [{ "id": "...", "name": "...", "description": "..." }],
      "project_teams": [{ "id": "...", "project_id": "...", "name": "...", "sort_order": 0 }],
      "project_topics": [...],
      "project_sub_topics": [...],
      "project_sub_topic_details": [...],
      "org_teams": [...],
      "org_team_children": [...],
      "capability_order": [...],
      "caps": [...],
      "cap_projects": [...]
    }
  }

Error 404:
  { "error": "ยังไม่มีข้อมูลบน Cloud" }
\`\`\`

### POST /api/sync/upload

\`\`\`
Request:
  POST ${baseUrl}/api/sync/upload
  Content-Type: application/json
  X-Google-User-Id: YOUR_USER_ID

  {
    "schema_version": 1,
    "version": 75,
    "updated_at": "2026-03-19T10:00:00Z",
    "tables": { ... all 10 tables ... }
  }

Response 200:
  { "ok": true }

Error 409 (conflict — cloud has newer data):
  {
    "ok": false,
    "error": "Cloud มีข้อมูลใหม่กว่า",
    "conflict": true,
    "remoteVersion": 74,
    "remoteUpdatedAt": "2026-03-19T04:57:11.866Z"
  }

Force upload (ignore conflict):
  POST ${baseUrl}/api/sync/upload?force=1
\`\`\`

### Version Check Flow (Architect Check)
1. \`GET /api/sync/version\` — check \`version\` and \`updated_at\`
2. Compare with local — if remote > local, there is a new update
3. To upload: set version = remote version + 1
4. On 409 conflict: use \`?force=1\` to overwrite (caution: data loss)

### PATCH /api/sync/patch

\`\`\`
Request:
  PATCH ${baseUrl}/api/sync/patch
  Content-Type: application/json
  X-Google-User-Id: YOUR_USER_ID
  Authorization: Bearer <token>   // optional (recommended)

{
  "base_version": 74,
  "ops": [
    { "op": "update", "table": "project_sub_topic_details",
      "id": "xxx", "fields": { "status": "done" },
      "field_updated_at": { "status": "2026-03-20T10:00:00Z" } },
    { "op": "insert", "table": "project_sub_topic_details",
      "row": { "id": "...", "status": "todo", "sort_order": 0 } },
    { "op": "delete", "table": "project_sub_topic_details", "id": "yyy" }
  ]
}
\`\`\`

Merge rule (field-level):
- For each updated field \`X\`, server compares \`X_updated_at\` (newer wins)
- If incoming is newer, server sets both \`X\` and \`X_updated_at\`

Rules:
- \`table\` must be one of the 10 sync tables (whitelist); otherwise op is rejected
- Max 100 ops per request; otherwise \`400\` \`ops limit exceeded (max 100)\`
- \`version\` / \`updated_at\` bump and disk save only when \`applied > 0\`

Response 200:
  { "ok": true, "version": 75, "applied": N, "rejected": [] }

Error 400:
  { "ok": false, "error": "ops limit exceeded (max 100)" }

Error 409:
  { "ok": false, "error": "...", "conflict": true, "remoteVersion": <serverVersion> }

---

## 3. Data Models

### 10 Sync Tables (export order)

1. **projects** — id, name, description
2. **project_teams** — id, project_id, name, sort_order
3. **project_topics** — id, team_id, title, sort_order
4. **project_sub_topics** — id, topic_id, title, status (GREEN/YELLOW/RED), sub_topic_type (todos/status), sort_order
5. **project_sub_topic_details** — id, sub_topic_id, text, description, status (todo/doing/done), due_date (YYYY-MM-DD), sort_order
6. **org_teams** — id, name, owner, parent_id
7. **org_team_children** — parent_id, child_id, sort_order
8. **capability_order** — sort_order, cap_id
9. **caps** — id, name, cols (12/6/4/3), rows
10. **cap_projects** — cap_id, project_id, status, cols, sort_order

### Table Hierarchy

\`\`\`
projects
  └─ project_teams        (1:N)
       └─ project_topics   (1:N)
            └─ project_sub_topics  (1:N)  — status: RED/YELLOW/GREEN
                 └─ project_sub_topic_details (1:N) — todo/doing/done + due_date
\`\`\`

### Status Values
- Project SubTopic: GREEN (Normal), YELLOW (Manageable), RED (Critical)
- Detail items: todo, doing, done

### Org Teams
\`\`\`
org_teams (parent/child hierarchy)
  └─ org_team_children (parent_id → child_id, sorted)
\`\`\`

### Capability (Dashboard Grid)
\`\`\`
capability_order (display order of caps)
  └─ caps (grid container: cols, rows)
       └─ cap_projects (project assignment to cap)
\`\`\`

---

## 4. Project Manage — Summary View & PDF Export (browser UI)

ฟีเจอร์นี้อยู่ที่หน้า **Project Manage** ปุ่ม **Summary View** (modal) — **ไม่มี REST endpoint แยก**; ดึงข้อมูลจาก state โปรเจกต์ในเบราว์เซอร์ (SQLite WASM / sync) เหมือนส่วนอื่นของแอป

### โหมดแสดงผล
- **Summary**: Executive summary + ตารางสรุปทีม/หัวข้อ + การ์ดรายละเอียดแยก Critical / Manageable / Normal (รวม Todo ในแต่ละหัวข้อย่อย)
- **Timeline**: ไทม์ไลน์แนวตั้ง เรียงตาม \`due_date\` (รูปแบบ **YYYY-MM-DD**) ของแถวใน \`project_sub_topic_details\` — รวมหลาย Todo **วันเดียวกัน + หัวข้อย่อยเดียวกัน** เป็นการ์ดเดียว (เหมือนการ์ดในโหมด Summary)

### กรองช่วงวันที่ (Report filter)
ที่แถบมุมขวาบนของ modal:
- **วันที่เริ่มต้น** / **วันที่สิ้นสุด** — กรองเฉพาะรายการ detail ที่มี \`due_date\` อยู่ในช่วม \[start, end\] (เทียบสตริงวันที่)
- **รวมรายการไม่ระบุวัน** (checkbox, เปิดค่าเริ่มต้น) — ถ้าเปิด: รายการที่ไม่มี \`due_date\` หรือรูปแบบไม่ใช่ YYYY-MM-DD ยังถูกรวม; ถ้าปิด: รายการเหล่านั้นถูกตัดออกจากรายงาน
- การกรองมีผลกับทั้ง **ตัวเลขสรุปด้านบน**, เนื้อหา **Summary**, **Timeline** และ **ไฟล์ PDF** ที่ส่งออกในขณะนั้น

### Save PDF
- ปุ่ม **Save PDF** สร้างไฟล์ฝั่ง client (\`html2canvas\` + \`jsPDF\`) เป็นหน้า PDF **ยาวต่อเนื่องหนึ่งหน้า** (ไม่ตัดเล่ม fixed A4 หลายหน้า)
- **ชื่อไฟล์**: \`{ชื่อโปรเจกต์}_{Summary|Timeline}_{YYYYMMDD}.pdf\`
  - \`Summary\` / \`Timeline\` ตามแท็บที่เลือกอยู่
  - \`YYYYMMDD\` = วันที่บนเครื่องผู้ใช้ตอนกดบันทึก

### สำหรับ AI ที่อ่านได้เฉพาะ API
ใช้ \`GET /api/sync/download\` แล้วนำ \`project_sub_topics\` + \`project_sub_topic_details\` ไปจัดช่วงวันที่ / สรุป / ไทม์ไลน์ได้แนวเดียวกับ UI

---

## 5. Sync Payload Format

\`\`\`json
{
  "schema_version": 1,
  "version": 74,
  "updated_at": "2026-03-19T04:57:11.866Z",
  "tables": {
    "projects": [...],
    "project_teams": [...],
    "project_topics": [...],
    "project_sub_topics": [...],
    "project_sub_topic_details": [...],
    "org_teams": [...],
    "org_team_children": [...],
    "capability_order": [...],
    "caps": [...],
    "cap_projects": [...]
  }
}
\`\`\`

Encrypted payload (optional, client-side AES-GCM):
\`\`\`json
{
  "version": 74,
  "updated_at": "...",
  "enc": "<base64 ciphertext>",
  "iv": "<base64 IV>",
  "salt": "<base64 salt>"
}
\`\`\`

---

## 6. Quick Start Workflow for AI Agent

### Step 1: Login
\`\`\`bash
curl -X POST ${baseUrl}/api/auth/token/login \\
  -H "Content-Type: application/json" \\
  -d '{"token": "atkn_YOUR_TOKEN"}'
# → { "ok": true, "googleId": "YOUR_USER_ID" }
\`\`\`

### Step 2: Check Sync Version
\`\`\`bash
curl -s ${baseUrl}/api/sync/download \\
  -H "X-Google-User-Id: YOUR_USER_ID" \\
  | jq '{version, updated_at}'
\`\`\`

### Step 3: Read Project Data
\`\`\`bash
# All projects
curl -s ${baseUrl}/api/sync/download \\
  -H "X-Google-User-Id: YOUR_USER_ID" \\
  | jq '.tables.projects[] | {id, name}'

# Incomplete tasks
curl -s ${baseUrl}/api/sync/download \\
  -H "X-Google-User-Id: YOUR_USER_ID" \\
  | jq '[.tables.project_sub_topic_details[] | select(.status != "done") | {text, status, due_date}]'

# Critical/Warning items
curl -s ${baseUrl}/api/sync/download \\
  -H "X-Google-User-Id: YOUR_USER_ID" \\
  | jq '[.tables.project_sub_topics[] | select(.status == "RED" or .status == "YELLOW") | {title, status}]'
\`\`\`

### Step 4: Update & Upload
\`\`\`bash
# 1. Download existing → modify → increment version → upload
curl -X POST ${baseUrl}/api/sync/upload \\
  -H "Content-Type: application/json" \\
  -H "X-Google-User-Id: YOUR_USER_ID" \\
  -d @modified_backup.json

# Force overwrite if conflict
curl -X POST "${baseUrl}/api/sync/upload?force=1" \\
  -H "Content-Type: application/json" \\
  -H "X-Google-User-Id: YOUR_USER_ID" \\
  -d @modified_backup.json
\`\`\`

---

## Summary Checklist

1. **Login** — Token login to get User ID
2. **Check Version** — Download backup, check version/updated_at
3. **Read Projects** — Parse tables.projects + related tables
4. **Read Teams** — Parse tables.org_teams + org_team_children
5. **Read Capability** — Parse caps + cap_projects + capability_order
6. **Read Tasks** — Parse project_sub_topic_details (todo/doing/done + due_date)
7. **Modify & Upload** — Edit data, increment version, upload back

---
*ArchTown — Open Claw AI Context v1 · SQLite WASM + React + Express*
`;
}

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
  console.log(`Cloud Sync backup dir: ${SYNC_DIR} (per user: <userId>/backup.json)`);
});
