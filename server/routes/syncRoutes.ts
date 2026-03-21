import fs from 'fs';
import type express from 'express';
import { Router } from 'express';
import { readBackupVersionAndUpdatedAt } from '../services/backupMetaService';
import { buildReplayPatchEvents } from '../services/auditReplayService';
import { getSyncBackupPath } from '../services/paths';
import { getResolvedSyncUserId } from '../services/tokenService';
import { runSyncPatch } from '../services/patchService';
import { addClient, broadcast, formatSseEvent, removeClient } from '../services/sseRegistry';
import { runSyncUpload } from '../services/uploadService';

export function createSyncRouter(): express.Router {
  const r = Router();

  r.get('/events', (req, res) => {
    try {
      const tokenAuth = req.syncAuth;
      if (tokenAuth && tokenAuth.scope !== 'read' && tokenAuth.scope !== 'write') {
        res.status(403).json({ ok: false, error: 'insufficient scope' });
        return;
      }
      const userId = getResolvedSyncUserId(req);
      if (!userId || userId === 'guest') {
        res.status(401).json({ ok: false, error: 'login required' });
        return;
      }

      const rawLast = req.headers['last-event-id'];
      const parsed = parseInt(Array.isArray(rawLast) ? rawLast[0] : (rawLast ?? '0'), 10);
      const lastEventId = Number.isFinite(parsed) ? parsed : 0;

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      (res as express.Response & { flushHeaders?: () => void }).flushHeaders?.();

      const connId = addClient(userId, res, lastEventId);

      for (const p of buildReplayPatchEvents(userId, lastEventId)) {
        res.write(
          formatSseEvent(p.version, 'patch', {
            version: p.version,
            ops: p.ops,
            actor: p.actor,
            ts: p.ts,
          }),
        );
      }

      const backupFile = getSyncBackupPath(userId);
      let version = 0;
      let updated_at = new Date().toISOString();
      if (fs.existsSync(backupFile)) {
        try {
          const b = JSON.parse(fs.readFileSync(backupFile, 'utf-8')) as {
            version?: number;
            updated_at?: string;
          };
          version = typeof b.version === 'number' ? b.version : Number(b.version ?? 0);
          if (typeof b.updated_at === 'string' && b.updated_at) updated_at = b.updated_at;
        } catch {
          /* ignore */
        }
      }

      res.write(formatSseEvent(undefined, 'version', { version, updated_at }));

      req.on('close', () => {
        removeClient(userId, connId);
      });
    } catch (e) {
      if (!res.headersSent) {
        res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
  });

  r.get('/version', async (req, res) => {
    try {
      const tokenAuth = req.syncAuth;
      if (tokenAuth && tokenAuth.scope !== 'read' && tokenAuth.scope !== 'write') {
        res.status(403).json({ ok: false, error: 'insufficient scope' });
        return;
      }
      const userId = getResolvedSyncUserId(req);
      const backupFile = getSyncBackupPath(userId);
      const meta = await readBackupVersionAndUpdatedAt(backupFile);
      if (!meta) {
        res.status(404).json({ error: 'ยังไม่มีข้อมูลบน Cloud' });
        return;
      }
      res.json({ version: meta.version, updated_at: meta.updated_at });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  r.get('/download', (req, res) => {
    try {
      const tokenAuth = req.syncAuth;
      const userId = getResolvedSyncUserId(req);
      const backupFile = getSyncBackupPath(userId);
      if (!fs.existsSync(backupFile)) {
        res.status(404).json({ error: 'ยังไม่มีข้อมูลบน Cloud' });
        return;
      }
      const json = fs.readFileSync(backupFile, 'utf-8');
      res.setHeader('Content-Type', 'application/json');
      res.send(json);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  r.patch('/patch', (req, res) => {
    try {
      const tokenAuth = req.syncAuth;
      const userId = getResolvedSyncUserId(req);
      const payload = req.body;
      const result = runSyncPatch({
        userId,
        tokenAuth,
        baseVersion: payload?.base_version,
        ops: payload?.ops,
      });
      if (result.ok === false) {
        res.status(result.status).json(result.body);
        return;
      }
      if (result.sseBroadcast) {
        const b = result.sseBroadcast;
        broadcast(
          userId,
          'patch',
          { version: b.version, ops: b.ops, actor: b.actor, ts: b.ts },
          b.version,
        );
      }
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  r.post('/upload', (req, res) => {
    try {
      const payload = req.body;
      const force =
        req.query.force === '1' || req.query.force === 'true' || (payload && typeof payload === 'object' && payload.force === true);
      const userId = getResolvedSyncUserId(req);
      const out = runSyncUpload({ userId, syncAuth: req.syncAuth, payload, force });
      if (out.ok === false) {
        res.status(out.status).json(out.body);
        return;
      }
      broadcast(userId, 'upload', { version: out.version, ts: out.updated_at }, out.version);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  return r;
}
