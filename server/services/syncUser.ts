import type { IncomingHttpHeaders } from 'http';
import type express from 'express';

type IncomingLike = {
  headers: express.Request['headers'] | IncomingHttpHeaders;
  query?: express.Request['query'];
  /** Raw URL including query (e.g. Connect / Vite middleware). */
  url?: string;
};

function firstHeaderVal(headers: IncomingLike['headers'], name: string): string {
  const h = headers as Record<string, string | string[] | undefined>;
  const v = h[name.toLowerCase()] ?? h[name];
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v[0] ?? '';
  return '';
}

/**
 * อ่าน user id จาก header / query / URL query string (รองรับทั้ง Express และ Vite dev middleware).
 */
export function getSyncUserIdFromIncoming(input: IncomingLike): string {
  const fromHeader = firstHeaderVal(input.headers, 'x-google-user-id');
  const fromExpressQuery = typeof input.query?.userId === 'string' ? input.query.userId : '';
  const fromUrl =
    input.url?.includes('userId=') && input.url.includes('?')
      ? new URLSearchParams(input.url.slice(input.url.indexOf('?'))).get('userId') || ''
      : '';
  const raw = fromHeader || fromExpressQuery || fromUrl;
  const safe = raw.replace(/[^a-zA-Z0-9_.-]/g, '');
  return safe || 'guest';
}

/** Sanitize Google user id for use as directory name (ป้องกัน path traversal). */
export function getSyncUserId(req: express.Request): string {
  return getSyncUserIdFromIncoming({ headers: req.headers, query: req.query, url: req.url });
}
