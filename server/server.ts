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
    if (!payload || typeof payload !== 'object' || !payload.schema_version || !payload.tables) {
      res.status(400).json({ ok: false, error: 'รูปแบบข้อมูลไม่ถูกต้อง' });
      return;
    }
    fs.mkdirSync(path.dirname(SYNC_BACKUP_FILE), { recursive: true });
    fs.writeFileSync(SYNC_BACKUP_FILE, JSON.stringify(payload), 'utf-8');
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
