/**
 * Production server: serve static dist/ + Cloud Sync API เท่านั้น
 *
 * แอปใช้ SQLite WASM ในเบราว์เซอร์ — ไม่ได้เรียก API อื่น
 * Server จำเป็นเฉพาะเมื่อต้องการฟีเจอร์ "Sync กับ Cloud" (อัปโหลด/ดาวน์โหลด backup)
 *
 * ถ้าไม่ใช้ Cloud Sync: deploy แค่โฟลเดอร์ dist/ บน static host (Vercel, Netlify, nginx) ก็พอ
 */
import { createApp } from './createApp';
import { SYNC_DIR } from './services/paths';

const app = createApp();

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Cloud Sync backup dir: ${SYNC_DIR} (per user: <userId>/backup.json)`);
});
