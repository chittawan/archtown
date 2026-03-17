/**
 * Production server: serve static dist/ + Cloud Sync API เท่านั้น
 *
 * แอปใช้ SQLite WASM ในเบราว์เซอร์ — ไม่ได้เรียก API อื่น
 * Server จำเป็นเฉพาะเมื่อต้องการฟีเจอร์ "Sync กับ Cloud" (อัปโหลด/ดาวน์โหลด backup)
 *
 * ถ้าไม่ใช้ Cloud Sync: deploy แค่โฟลเดอร์ dist/ บน static host (Vercel, Netlify, nginx) ก็พอ
 */
import express from 'express';
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

type StoredToken = {
  id: string;
  tokenHash: string;
  googleId: string;
  createdAt: string;
  expiresAt: string | null;
};

type TokenStore = { version: 1; tokens: StoredToken[] };

function readTokenStore(): TokenStore {
  try {
    if (!fs.existsSync(TOKENS_FILE)) return { version: 1, tokens: [] };
    const raw = fs.readFileSync(TOKENS_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<TokenStore>;
    if (parsed.version !== 1 || !Array.isArray(parsed.tokens)) return { version: 1, tokens: [] };
    return { version: 1, tokens: parsed.tokens as StoredToken[] };
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

    res.json({ ok: true, token, googleId, expiresAt });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
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
    res.json({ ok: true, googleId: match.googleId, expiresAt: match.expiresAt });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// --- Cloud Sync API (เก็บ/ดึง backup ต่อ user: data/sync/{googleId}/backup.json) ---
app.get('/api/sync/download', (req, res) => {
  try {
    const userId = getSyncUserId(req);
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

app.post('/api/sync/upload', (req, res) => {
  try {
    const payload = req.body;
    const isPlain = payload?.schema_version != null && payload?.tables != null;
    const isEncrypted = typeof payload?.enc === 'string' && typeof payload?.iv === 'string' && typeof payload?.salt === 'string';
    if (!payload || typeof payload !== 'object' || (!isPlain && !isEncrypted)) {
      res.status(400).json({ ok: false, error: 'รูปแบบข้อมูลไม่ถูกต้อง' });
      return;
    }
    const userId = getSyncUserId(req);
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
