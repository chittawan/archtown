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
const SYNC_BACKUP_FILE = path.join(DATA_ROOT, 'sync', 'backup.json');

const app = express();
app.use(express.json({ limit: '10mb' }));

// --- Cloud Sync API (เก็บ/ดึง backup เพื่อเปิดได้ทุกที่) ---
app.get('/api/sync/download', (_req, res) => {
  try {
    if (!fs.existsSync(SYNC_BACKUP_FILE)) {
      res.status(404).json({ error: 'ยังไม่มีข้อมูลบน Cloud' });
      return;
    }
    const json = fs.readFileSync(SYNC_BACKUP_FILE, 'utf-8');
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
    const force = req.query.force === '1' || req.query.force === 'true' || payload.force === true;

    if (!force && fs.existsSync(SYNC_BACKUP_FILE)) {
      const existingJson = fs.readFileSync(SYNC_BACKUP_FILE, 'utf-8');
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

    fs.mkdirSync(path.dirname(SYNC_BACKUP_FILE), { recursive: true });
    const { force: _f, ...payloadToWrite } = payload;
    fs.writeFileSync(SYNC_BACKUP_FILE, JSON.stringify(payloadToWrite), 'utf-8');
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
  console.log(`Cloud Sync backup: ${SYNC_BACKUP_FILE}`);
});
