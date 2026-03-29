/**
 * แปลงค่าจาก catch/reject ให้เป็นข้อความอ่านได้ (กัน [object Object] จาก worker/IDB)
 */
export function formatUnknownError(err: unknown, fallback = 'เกิดข้อผิดพลาด'): string {
  if (err == null || err === '') return fallback;
  if (typeof err === 'string') return err;
  if (err instanceof Error) return (err.message || err.name || fallback).trim() || fallback;
  if (typeof err === 'object') {
    const o = err as Record<string, unknown>;
    if (typeof o.message === 'string' && o.message.trim()) return o.message.trim();
    if (typeof o.error === 'string' && o.error.trim()) return o.error.trim();
    if (typeof o.reason === 'string' && o.reason.trim()) return o.reason.trim();
    try {
      const s = JSON.stringify(err);
      if (s && s !== '{}' && s !== 'null') return s;
    } catch {
      /* ignore */
    }
  }
  return `${fallback} — ดู Console สำหรับรายละเอียด`;
}

export function toError(err: unknown, fallback = 'เกิดข้อผิดพลาด'): Error {
  if (err instanceof Error) return err;
  return new Error(formatUnknownError(err, fallback));
}
