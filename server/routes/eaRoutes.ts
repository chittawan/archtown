import type express from 'express';
import { Router } from 'express';
import {
  getEaOverview,
  getHistory,
  getProjectEaSummary,
  getWeekSnapshot,
  getWeeks,
  saveWeeks,
  takeWeeklySnapshot,
} from '../services/eaWeeklyService';
import { getResolvedSyncUserId } from '../services/tokenService';

function requireWrite(req: express.Request, res: express.Response): boolean {
  const tokenAuth = req.syncAuth;
  if (tokenAuth && tokenAuth.scope !== 'write') {
    res.status(403).json({ ok: false, error: 'insufficient scope' });
    return false;
  }
  return true;
}

function requireRead(req: express.Request, res: express.Response): boolean {
  const tokenAuth = req.syncAuth;
  if (tokenAuth && tokenAuth.scope !== 'read' && tokenAuth.scope !== 'write') {
    res.status(403).json({ ok: false, error: 'insufficient scope' });
    return false;
  }
  return true;
}

export function createEaRouter(): express.Router {
  const r = Router();

  /** สรุปทุกโปรเจกต์สำหรับ dashboard (อ่านจาก backup + โฟลเดอร์ EA) */
  r.get('/overview', (req, res) => {
    try {
      if (!requireRead(req, res)) return;
      const userId = getResolvedSyncUserId(req);
      const result = getEaOverview(userId);
      if (result.ok === false) {
        res.status(result.status).json({ ok: false, error: result.error });
        return;
      }
      res.json({ ok: true, projects: result.projects });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  /** สรุปรายโปรเจกต์ — week definitions + snapshot ล่าสุด (ตัวเลขต่อทีม) */
  r.get('/:projectId/summary', (req, res) => {
    try {
      if (!requireRead(req, res)) return;
      const userId = getResolvedSyncUserId(req);
      const result = getProjectEaSummary(userId, req.params.projectId);
      if (result.ok === false) {
        res.status(result.status).json({ ok: false, error: result.error });
        return;
      }
      res.json({ ok: true, ...result.data });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  r.get('/:projectId/weeks', (req, res) => {
    try {
      if (!requireRead(req, res)) return;
      const userId = getResolvedSyncUserId(req);
      const result = getWeeks(userId, req.params.projectId);
      if (result.ok === false) {
        res.status(result.status).json({ ok: false, error: result.error });
        return;
      }
      res.json({ ok: true, ...result.data });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  r.put('/:projectId/weeks', (req, res) => {
    try {
      if (!requireWrite(req, res)) return;
      const userId = getResolvedSyncUserId(req);
      const result = saveWeeks(userId, req.params.projectId, req.body);
      if (result.ok === false) {
        res.status(result.status).json({ ok: false, error: result.error });
        return;
      }
      res.json({ ok: true, ...result.data });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  r.post('/:projectId/snapshot', (req, res) => {
    try {
      if (!requireWrite(req, res)) return;
      const userId = getResolvedSyncUserId(req);
      const week_no =
        req.body && typeof req.body === 'object' && 'week_no' in req.body
          ? (req.body as { week_no?: unknown }).week_no
          : undefined;
      const result = takeWeeklySnapshot(userId, req.params.projectId, week_no);
      if (result.ok === false) {
        res.status(result.status).json({ ok: false, error: result.error });
        return;
      }
      res.json({ ok: true, snapshot: result.data });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  r.get('/:projectId/history/:week_no', (req, res) => {
    try {
      if (!requireRead(req, res)) return;
      const userId = getResolvedSyncUserId(req);
      const week_no = Number(req.params.week_no);
      if (!Number.isFinite(week_no)) {
        res.status(400).json({ ok: false, error: 'invalid week_no' });
        return;
      }
      const result = getWeekSnapshot(userId, req.params.projectId, week_no);
      if (result.ok === false) {
        res.status(result.status).json({ ok: false, error: result.error });
        return;
      }
      if (!result.snapshot) {
        res.status(404).json({ ok: false, error: 'no snapshot for this week' });
        return;
      }
      res.json({ ok: true, snapshot: result.snapshot });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  r.get('/:projectId/history', (req, res) => {
    try {
      if (!requireRead(req, res)) return;
      const userId = getResolvedSyncUserId(req);
      const all =
        req.query.all === '1' ||
        req.query.all === 'true' ||
        String(req.query.all ?? '').toLowerCase() === 'yes';
      const result = getHistory(userId, req.params.projectId, { allSnapshots: all });
      if (result.ok === false) {
        res.status(result.status).json({ ok: false, error: result.error });
        return;
      }
      res.json({
        ok: true,
        snapshots: result.snapshots,
        total_files: result.total_files,
        display_mode: all ? 'all_files' : 'latest_per_week',
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  return r;
}
