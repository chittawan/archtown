/**
 * Cloud Sync: อัปโหลด/ดาวน์โหลด backup ไปยัง server เพื่อเปิดได้ทุกที่
 * ใช้ร่วมกับ /api/sync/upload และ /api/sync/download
 */
import { exportForSync } from './sync';
import { importFromSync } from './sync';

const SYNC_UPLOAD_URL = '/api/sync/upload';
const SYNC_DOWNLOAD_URL = '/api/sync/download';

export type CloudSyncResult = { ok: true } | { ok: false; error: string };

/**
 * ส่งออก DB ปัจจุบันไปยัง Cloud (server)
 */
export async function uploadToCloud(): Promise<CloudSyncResult> {
  try {
    const blob = await exportForSync();
    const json = await blob.text();
    const res = await fetch(SYNC_UPLOAD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || data.message || `HTTP ${res.status}` };
    }
    if (data.ok === false) {
      return { ok: false, error: data.error || 'อัปโหลดไม่สำเร็จ' };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * ดึงข้อมูลจาก Cloud มาแทนที่ DB ปัจจุบัน (เปิดได้ทุกที่)
 */
export async function downloadFromCloud(): Promise<CloudSyncResult> {
  try {
    const res = await fetch(SYNC_DOWNLOAD_URL);
    if (res.status === 404) {
      return { ok: false, error: 'ยังไม่มีข้อมูลบน Cloud' };
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.error || data.message || `HTTP ${res.status}` };
    }
    const buffer = await res.arrayBuffer();
    await importFromSync(buffer);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** ตรวจว่า server รองรับ sync หรือไม่ (มี API) */
export async function isSyncAvailable(): Promise<boolean> {
  try {
    const res = await fetch(SYNC_DOWNLOAD_URL, { method: 'HEAD' });
    return res.status === 200 || res.status === 404;
  } catch {
    return false;
  }
}
