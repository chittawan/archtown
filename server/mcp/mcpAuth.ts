import type express from 'express';
import { extractTokenFromRequest } from '../services/tokenService';

/** Path-embedded token: one segment, no slashes (sync tokens are typically atkn_…). */
const PATH_TOKEN_RE = /^atkn_[a-zA-Z0-9_.-]+$/;

/**
 * Resolve sync token for MCP: headers first (Bearer / x-archtown-token), then URL query
 * (`token`, `t`), then path segment `POST /mcp/:mcpToken` for Claude.ai etc. that cannot set custom headers.
 * Path form requires `atkn_` prefix so `POST /mcp/health` is not mistaken for a token.
 */
export function extractMcpToken(req: express.Request): string | null {
  const fromHeader = extractTokenFromRequest(req);
  if (fromHeader) return fromHeader;

  const qToken = req.query.token;
  if (typeof qToken === 'string' && qToken.trim()) return qToken.trim();

  const qT = req.query.t;
  if (typeof qT === 'string' && qT.trim()) return qT.trim();

  const pathTok = req.params.mcpToken;
  if (typeof pathTok === 'string') {
    const t = pathTok.trim();
    if (t && PATH_TOKEN_RE.test(t)) return t;
  }

  return null;
}
