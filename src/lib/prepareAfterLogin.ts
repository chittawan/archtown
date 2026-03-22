import { ensureDb } from '../db/client';
import * as archtownDb from '../db/archtownDb';
import { isSyncAvailable, downloadFromCloud } from '../db/cloudSync';

export type PrepareStep =
  | { progress: number; label: string }
  | { progress: number; label: string; kind: 'sync-skipped' };

/**
 * Shared post-login preparation:
 * - init DB
 * - try restore from Cloud (if available)
 * - warm up commonly-used queries
 */
const PREPARE_AFTER_LOGIN_TIMEOUT_MS = 180_000;

export async function prepareAfterLogin(onStep?: (s: PrepareStep) => void): Promise<void> {
  const run = async (): Promise<void> => {
    onStep?.({ progress: 10, label: 'กำลังเตรียมฐานข้อมูล...' });
    await ensureDb();
    onStep?.({ progress: 25, label: 'กำลังตรวจสอบ Cloud...' });

    const syncOk = await isSyncAvailable();
    if (syncOk) {
      onStep?.({ progress: 35, label: 'กำลัง Restore ข้อมูลล่าสุดจาก Cloud...' });
      const result = await downloadFromCloud();
      if (result.ok) {
        onStep?.({ progress: 50, label: 'Restore จาก Cloud แล้ว' });
      } else {
        onStep?.({ progress: 45, label: 'ข้าม Restore (ไม่มีข้อมูล/ยังไม่ได้ล็อกอิน/ไฟล์เข้ารหัส)', kind: 'sync-skipped' });
      }
    }

    onStep?.({ progress: 55, label: 'กำลังโหลดและเตรียมข้อมูล...' });
    await archtownDb.listProjects();
    onStep?.({ progress: 75, label: 'กำลังเตรียม Layout...' });
    await archtownDb.getCapabilityLayout();
    onStep?.({ progress: 100, label: 'พร้อมแล้ว' });
  };

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error(
          'หมดเวลาเตรียมข้อมูล (เครือข่ายช้า หรือฐานข้อมูลในเบราว์เซอร์ไม่ตอบ) — ลองรีเฟรชหรือล็อกอินใหม่'
        )
      );
    }, PREPARE_AFTER_LOGIN_TIMEOUT_MS);
  });
  try {
    await Promise.race([run(), timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

