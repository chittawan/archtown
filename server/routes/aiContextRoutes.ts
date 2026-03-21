import type express from 'express';
import { Router } from 'express';
import { buildAIContextMarkdown } from '../services/aiContextMarkdown';

export function createAiContextRouter(): express.Router {
  const r = Router();
  r.get('/context', (req, res) => {
    const host = req.headers.host || 'localhost';
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const base = `${proto}://${host}`;
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.send(buildAIContextMarkdown(base));
  });
  return r;
}
