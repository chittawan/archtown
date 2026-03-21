import fs from 'fs';
import type express from 'express';
import { Router } from 'express';
import { readBackupVersionAndUpdatedAt } from '../services/backupMetaService';
import { getSyncBackupPath } from '../services/paths';
import { getSyncUserId } from '../services/syncUser';
import { runSyncPatch } from '../services/patchService';
import { runSyncUpload } from '../services/uploadService';

export function createSyncRouter(): express.Router {
  const r = Router();

  r.get('/version', async (req, res) => {
    try {
      const tokenAuth = req.syncAuth;
      if (tokenAuth && tokenAuth.scope !== 'read' && tokenAuth.scope !== 'write') {
        res.status(403).json({ ok: false, error: 'insufficient scope' });
        return;
      }
      const userId = tokenAuth?.googleId ?? getSyncUserId(req);
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
      const userId = tokenAuth?.googleId ?? getSyncUserId(req);
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
      const userId = tokenAuth?.googleId ?? getSyncUserId(req);
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
      const userId = req.syncAuth?.googleId ?? getSyncUserId(req);
      const out = runSyncUpload({ userId, syncAuth: req.syncAuth, payload, force });
      if (out.ok === false) {
        res.status(out.status).json(out.body);
        return;
      }
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  return r;
}
