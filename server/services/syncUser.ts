import type express from 'express';

/** Sanitize Google user id for use as directory name (ป้องกัน path traversal). */
export function getSyncUserId(req: express.Request): string {
  const raw = (req.headers['x-google-user-id'] as string) || (req.query.userId as string) || '';
  const safe = raw.replace(/[^a-zA-Z0-9_.-]/g, '');
  return safe || 'guest';
}
