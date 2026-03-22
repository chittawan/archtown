/**
 * Mirror of src/lib/idUtils.ts — server/MCP must not import from src/ (Docker images
 * often omit the frontend tree). Keep nameToId + sanitizeId in sync with src when changing.
 */

export function nameToId(name: string): string {
  if (!name || typeof name !== 'string') return '';
  let s = name.trim();
  s = s.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  s = s.replace(/[^\p{L}\p{N}]/gu, ' ').toLowerCase();
  const words = s.split(/\s+/).filter(Boolean);
  return words.join('_') || '';
}

export function sanitizeId(id: string): string {
  const s = String(id || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return s || '';
}
