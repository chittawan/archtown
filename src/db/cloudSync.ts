/**
 * Cloud Sync: อัปโหลด/ดาวน์โหลด backup ไปยัง server เพื่อเปิดได้ทุกที่
 * ใช้ร่วมกับ /api/sync/upload และ /api/sync/download
 * รองรับการเข้ารหัสด้วยรหัสผ่าน (AES-GCM) ก่อนอัปโหลด
 */
import { exportAllTables, importAllTables, SYNC_LAST_UPLOADED_KEY } from './archtownDb';
import {
  base64ToArrayBuffer,
  base64ToBytes,
  buildEncryptedSyncPayload,
  decryptPayload,
  encryptPayload,
  isEncryptedPayload,
  mergeDecryptedWithMeta,
  type EncryptedInnerPayload,
} from './syncCrypto';
import { exportForSync, importFromSync } from './sync';
import { getGoogleUserId } from '../lib/googleAuth';

const SYNC_UPLOAD_URL = '/api/sync/upload';
const SYNC_DOWNLOAD_URL = '/api/sync/download';

function getSyncHeaders(): Record<string, string> {
  const userId = getGoogleUserId();
  return { 'X-Google-User-Id': userId ?? 'guest' };
}

export type CloudSyncFailure = {
  ok: false;
  error: string;
  conflict?: boolean;
  remoteVersion?: number;
  remoteUpdatedAt?: string | null;
};

export type CloudSyncResult = { ok: true } | CloudSyncFailure;

/**
 * ส่งออก DB ปัจจุบันไปยัง Cloud (server).
 * @param force - ถ้า true ส่ง ?force=1 เพื่อเขียนทับข้อมูลบน Cloud แม้ version ใหม่กว่า
 * @param password - ถ้าระบุ จะเข้ารหัส payload ก่อนอัปโหลด (เก็บเฉพาะในหน่วยความจำ)
 */
export async function uploadToCloud(force = false, password?: string): Promise<CloudSyncResult> {
  try {
    let body: string;
    let version: number | undefined;
    let updated_at: string | undefined;

    if (password != null && password !== '') {
      const payload = await exportAllTables();
      const inner = { schema_version: payload.schema_version, tables: payload.tables };
      const { encrypted, iv, salt } = await encryptPayload(JSON.stringify(inner), password);
      const wrapper = buildEncryptedSyncPayload(payload, encrypted, iv, salt);
      version = payload.version;
      updated_at = payload.updated_at;
      body = JSON.stringify(force ? { ...wrapper, force: true } : wrapper);
    } else {
      const blob = await exportForSync();
      const json = await blob.text();
      const parsed = JSON.parse(json) as { version?: number; updated_at?: string };
      version = parsed.version;
      updated_at = parsed.updated_at;
      body = force ? JSON.stringify({ ...parsed, force: true }) : json;
    }

    const url = force ? `${SYNC_UPLOAD_URL}?force=1` : SYNC_UPLOAD_URL;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getSyncHeaders() },
      body,
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      message?: string;
      conflict?: boolean;
      remoteVersion?: number;
      remoteUpdatedAt?: string | null;
    };
    if (res.status === 409) {
      return {
        ok: false,
        error: data.error || 'Cloud มีข้อมูลใหม่กว่า',
        conflict: true,
        remoteVersion: data.remoteVersion,
        remoteUpdatedAt: data.remoteUpdatedAt ?? null,
      };
    }
    if (!res.ok) {
      return { ok: false, error: data.error || data.message || `HTTP ${res.status}` };
    }
    if (data.ok === false) {
      return { ok: false, error: data.error || 'อัปโหลดไม่สำเร็จ' };
    }
    try {
      if (version != null && updated_at != null && typeof localStorage !== 'undefined') {
        localStorage.setItem(SYNC_LAST_UPLOADED_KEY, JSON.stringify({ version, updated_at }));
      }
    } catch {
      /* ignore */
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * ดึงข้อมูลจาก Cloud มาแทนที่ DB ปัจจุบัน (เปิดได้ทุกที่).
 * @param password - ถ้า backup บน Cloud เข้ารหัสไว้ ต้องใส่รหัสผ่านเพื่อถอดรหัส
 */
export async function downloadFromCloud(password?: string): Promise<CloudSyncResult> {
  try {
    const res = await fetch(SYNC_DOWNLOAD_URL, { headers: getSyncHeaders() });
    if (res.status === 404) {
      return { ok: false, error: 'ยังไม่มีข้อมูลบน Cloud' };
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: (data as { error?: string; message?: string }).error || (data as { error?: string; message?: string }).message || `HTTP ${res.status}` };
    }
    const buffer = await res.arrayBuffer();
    const json = new TextDecoder().decode(buffer);
    const payload = JSON.parse(json) as Record<string, unknown> & { version?: number; updated_at?: string };

    if (isEncryptedPayload(payload)) {
      if (password == null || password === '') {
        return { ok: false, error: 'ต้องใส่รหัสผ่านเพื่อถอดรหัสข้อมูลจาก Cloud' };
      }
      try {
        const decrypted = await decryptPayload(
          base64ToArrayBuffer(payload.enc),
          base64ToBytes(payload.iv),
          password,
          base64ToBytes(payload.salt)
        );
        const inner = JSON.parse(decrypted) as EncryptedInnerPayload;
        const full = mergeDecryptedWithMeta(inner, payload.version as number | undefined, payload.updated_at as string | undefined);
        await importAllTables(full);
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    } else {
      await importFromSync(buffer);
    }

    try {
      if (payload.version != null && payload.updated_at != null && typeof localStorage !== 'undefined') {
        localStorage.setItem(SYNC_LAST_UPLOADED_KEY, JSON.stringify({ version: payload.version, updated_at: payload.updated_at }));
      }
    } catch {
      /* ignore */
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Restore DB from a local JSON file (e.g. backup.json).
 * รองรับทั้งไฟล์ธรรมดาและไฟล์ที่เข้ารหัส (ใส่รหัสผ่านถ้าเคยเข้ารหัสตอน export)
 */
export async function restoreFromJsonFile(buffer: ArrayBuffer, password?: string): Promise<CloudSyncResult> {
  try {
    const json = new TextDecoder().decode(buffer);
    const payload = JSON.parse(json) as Record<string, unknown> & { version?: number; updated_at?: string };

    if (isEncryptedPayload(payload)) {
      if (password == null || password === '') {
        return { ok: false, error: 'ต้องใส่รหัสผ่านเพื่อถอดรหัสข้อมูลจากไฟล์' };
      }
      try {
        const decrypted = await decryptPayload(
          base64ToArrayBuffer(payload.enc),
          base64ToBytes(payload.iv),
          password,
          base64ToBytes(payload.salt)
        );
        const inner = JSON.parse(decrypted) as EncryptedInnerPayload;
        const full = mergeDecryptedWithMeta(inner, payload.version as number | undefined, payload.updated_at as string | undefined);
        await importAllTables(full);
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    } else {
      await importFromSync(buffer);
    }

    try {
      if (payload.version != null && payload.updated_at != null && typeof localStorage !== 'undefined') {
        localStorage.setItem(SYNC_LAST_UPLOADED_KEY, JSON.stringify({ version: payload.version, updated_at: payload.updated_at }));
      }
    } catch {
      /* ignore */
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** ตรวจว่า server รองรับ sync หรือไม่ (มี API) */
export async function isSyncAvailable(): Promise<boolean> {
  try {
    const res = await fetch(SYNC_DOWNLOAD_URL, { method: 'HEAD', headers: getSyncHeaders() });
    return res.status === 200 || res.status === 404;
  } catch {
    return false;
  }
}

/** อ่านเวลาที่ sync ขึ้น Cloud ล่าสุด (สำหรับแสดงใน UI) */
export function getLastSyncedAt(): { version: number; updated_at: string } | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(SYNC_LAST_UPLOADED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version?: number; updated_at?: string };
    if (parsed.version == null || !parsed.updated_at) return null;
    return { version: parsed.version, updated_at: parsed.updated_at };
  } catch {
    return null;
  }
}
