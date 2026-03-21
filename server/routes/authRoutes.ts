import type express from 'express';
import { Router } from 'express';
import { requireAdminKeyIfConfigured } from '../services/adminAuthService';
import {
  generateAIToken,
  loginWithTokenBody,
  parseExpiresAt,
  parseRequestedTokenScope,
  sanitizeGoogleId,
} from '../services/tokenService';

export function createAuthRouter(): express.Router {
  const r = Router();

  r.post('/token/generate', (req, res) => {
    try {
      if (!requireAdminKeyIfConfigured(req, res)) return;

      const rawGoogleId = (req.body?.googleId as string) || '';
      const googleId = sanitizeGoogleId(rawGoogleId);
      if (!googleId) {
        res.status(400).json({ ok: false, error: 'googleId is required' });
        return;
      }

      const expiresAt = parseExpiresAt(req.body?.expiresAt);
      const scope = parseRequestedTokenScope(req.body?.scope);
      const { token } = generateAIToken(googleId, expiresAt, scope);

      res.json({ ok: true, token, googleId, expiresAt, scope });
    } catch (e) {
      const msg = String(e);
      res.status(msg.toLowerCase().includes('invalid token scope') ? 400 : 500).json({ ok: false, error: msg });
    }
  });

  r.post('/token/login', (req, res) => {
    try {
      const token = String(req.body?.token || '').trim();
      if (!token) {
        res.status(400).json({ ok: false, error: 'token is required' });
        return;
      }
      const result = loginWithTokenBody(token);
      if (result.ok === false) {
        res.status(result.status).json({ ok: false, error: result.error });
        return;
      }
      res.json({
        ok: true,
        googleId: result.googleId,
        expiresAt: result.expiresAt,
        scope: result.scope,
        tokenId: result.tokenId,
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  return r;
}
