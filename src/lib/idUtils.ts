/**
 * ID format: ตัวเล็กทั้งหมด เชื่อมด้วย _
 * ใช้กับ cap, project, team เพื่อให้เชื่อม data/capability กับ data/projects ง่าย
 */

/**
 * แปลงชื่อเป็น id: lowercase เท่านั้น คำเชื่อมด้วย _
 * รับทั้ง "Product And Price" และ "productAndPrice" ได้
 */
export function nameToId(name: string): string {
  if (!name || typeof name !== 'string') return '';
  let s = name.trim();
  // แยก camelCase เป็นคำ (ใส่ space ก่อนตัวใหญ่)
  s = s.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  // เหลือแค่ตัวอักษร/ตัวเลข แล้วแทนที่ด้วย space
  s = s.replace(/[^\p{L}\p{N}]/gu, ' ').toLowerCase();
  const words = s.split(/\s+/).filter(Boolean);
  return words.join('_') || '';
}

/**
 * สร้าง id ที่ไม่ซ้ำกับรายการที่มีอยู่
 */
export function ensureUniqueId(baseId: string, existingIds: string[]): string {
  const set = new Set(existingIds.map((x) => x.toLowerCase()));
  const lower = baseId.toLowerCase();
  if (!set.has(lower)) return baseId;
  let n = 1;
  while (set.has(`${lower}_${n}`)) n++;
  return `${baseId}_${n}`;
}

/** เฉพาะ [a-z0-9_] ใช้เป็น filename */
export function sanitizeId(id: string): string {
  const s = String(id || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return s || '';
}
