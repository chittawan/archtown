import type { SyncAuth } from './syncAuth';

declare global {
  namespace Express {
    interface Request {
      syncAuth?: SyncAuth;
    }
  }
}

export {};
