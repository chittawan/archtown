import rateLimit from 'express-rate-limit';
import type express from 'express';
import { extractTokenFromRequest, verifySyncToken } from '../services/tokenService';
import { getSyncUserId } from '../services/syncUser';

export function createSyncRateLimiter() {
  return rateLimit({
    windowMs: 60_000,
    limit: 60,
    keyGenerator: (req: express.Request) => {
      if (req.syncAuth) return `token:${req.syncAuth.tokenHash}`;
      const userId = getSyncUserId(req);
      return `google:${userId}`;
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ ok: false, error: 'rate limit exceeded' }),
  });
}

const SYNC_PATHS = ['/api/sync/download', '/api/sync/upload', '/api/sync/version', '/api/sync/patch'] as const;

export function optionalSyncTokenMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = extractTokenFromRequest(req);
  if (!token) return next();
  try {
    req.syncAuth = verifySyncToken(token);
    return next();
  } catch (e) {
    const status = (e as Error & { status?: number })?.status ?? 401;
    const msg = String((e as Error)?.message ?? e);
    return res.status(status).json({ ok: false, error: msg });
  }
}

export function mountSyncAuthAndRateLimit(app: express.Application, syncRateLimiter: ReturnType<typeof createSyncRateLimiter>) {
  app.use([...SYNC_PATHS], optionalSyncTokenMiddleware);
  app.use([...SYNC_PATHS], syncRateLimiter);
}

export function mountAuditAuthAndRateLimit(app: express.Application, syncRateLimiter: ReturnType<typeof createSyncRateLimiter>) {
  app.use('/api/audit', optionalSyncTokenMiddleware);
  app.use('/api/audit', syncRateLimiter);
}
