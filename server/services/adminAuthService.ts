import type express from 'express';

export function requireAdminKeyIfConfigured(req: express.Request, res: express.Response): boolean {
  const configured = process.env.ARCHTOWN_ADMIN_KEY;
  if (!configured) return true;
  const got = (req.headers['x-admin-key'] as string) || '';
  if (got && got === configured) return true;
  res.status(401).json({ ok: false, error: 'unauthorized' });
  return false;
}
