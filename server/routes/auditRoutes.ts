import type express from 'express';
import { Router } from 'express';
import { queryAuditLines, performAuditUndo } from '../services/auditService';
import { getResolvedSyncUserId } from '../services/tokenService';

export function createAuditRouter(): express.Router {
  const r = Router();

  r.get('/', (req, res) => {
    try {
      const tokenAuth = req.syncAuth;
      if (tokenAuth && tokenAuth.scope !== 'read' && tokenAuth.scope !== 'write') {
        res.status(403).json({ ok: false, error: 'insufficient scope' });
        return;
      }
      const userId = getResolvedSyncUserId(req);
      const dateParam = req.query.date;
      const date =
        typeof dateParam === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
          ? dateParam
          : new Date().toISOString().slice(0, 10);
      const tableQ = typeof req.query.table === 'string' ? req.query.table : '';
      const idQ = typeof req.query.id === 'string' ? req.query.id : '';

      const lines = queryAuditLines(userId, { date, table: tableQ || undefined, id: idQ || undefined });
      res.json({ ok: true, lines });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  r.post('/undo/:req_id', (req, res) => {
    try {
      const tokenAuth = req.syncAuth;
      if (tokenAuth && tokenAuth.scope !== 'write') {
        res.status(403).json({ ok: false, error: 'insufficient scope' });
        return;
      }
      const userId = getResolvedSyncUserId(req);
      const reqIdUndo = req.params.req_id;
      const result = performAuditUndo(userId, reqIdUndo);
      if (result.ok === false) {
        res.status(result.status).json(result.body);
        return;
      }
      res.json({ ok: true, reversed: result.reversed, version: result.version });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  return r;
}
