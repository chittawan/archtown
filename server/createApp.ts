import './types/express-augment';
import express from 'express';
import {
  createSyncRateLimiter,
  mountAuditAuthAndRateLimit,
  mountSyncAuthAndRateLimit,
} from './middleware/syncAuthMiddleware';
import { createAuthRouter } from './routes/authRoutes';
import { createSyncRouter } from './routes/syncRoutes';
import { createAuditRouter } from './routes/auditRoutes';
import { createAiContextRouter } from './routes/aiContextRoutes';
import { createMcpRouter } from './routes/mcpRoutes';
import { mountStaticSpa } from './routes/staticRoutes';

export function createApp(): express.Application {
  const app = express();

  app.use((_req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
  });

  app.use(express.json({ limit: '10mb' }));

  const syncRateLimiter = createSyncRateLimiter();
  mountSyncAuthAndRateLimit(app, syncRateLimiter);
  mountAuditAuthAndRateLimit(app, syncRateLimiter);

  app.use('/api/auth', createAuthRouter());
  app.use('/api/sync', createSyncRouter());
  app.use('/api/audit', createAuditRouter());
  app.use('/api/ai', createAiContextRouter());
  app.use('/mcp', createMcpRouter());

  mountStaticSpa(app);

  return app;
}
