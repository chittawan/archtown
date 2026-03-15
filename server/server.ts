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

const DATA_ROOT = path.join(process.cwd(), 'data');
const SYNC_DIR = path.join(DATA_ROOT, 'sync');

/** Sanitize Google user id for use as directory name (ป้องกัน path traversal). */
function getSyncUserId(req: express.Request): string {
  const raw = (req.headers['x-google-user-id'] as string) || (req.query.userId as string) || '';
  const safe = raw.replace(/[^a-zA-Z0-9_.-]/g, '');
  return safe || 'guest';
}

function getSyncBackupPath(userId: string): string {
  return path.join(SYNC_DIR, userId, 'backup.json');
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
