import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { IncomingHttpHeaders } from 'http';
import type express from 'express';
import type { SyncAuth, TokenScope } from '../types/syncAuth';
import { getSyncUserId, getSyncUserIdFromIncoming } from './syncUser';
import { TOKENS_FILE } from './paths';

type StoredToken = {
  id: string;
  tokenHash: string;
  googleId: string;
  createdAt: string;
  expiresAt: string | null;
  scope: TokenScope;
};

type TokenStore = { version: 1; tokens: StoredToken[] };

function readTokenStore(): TokenStore {
  try {
    if (!fs.existsSync(TOKENS_FILE)) return { version: 1, tokens: [] };
    const raw = fs.readFileSync(TOKENS_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<TokenStore>;
    if (parsed.version !== 1 || !Array.isArray(parsed.tokens)) return { version: 1, tokens: [] };
    const tokens = (parsed.tokens as Partial<StoredToken>[]).map((t) => {
      const scope = t.scope === 'read' || t.scope === 'write' ? t.scope : 'write';
      return { ...(t as StoredToken), scope };
    });
    return { version: 1, tokens };
  } catch {
    return { version: 1, tokens: [] };
  }
}

function writeTokenStore(store: TokenStore): void {
  fs.mkdirSync(path.dirname(TOKENS_FILE), { recursive: true });
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  const aa = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

/** Same id as audit/SSE \`actor\` prefix for AI tokens: \`ai:<tokenId>\`. */
export function syncTokenIdFromStoredRecord(record: Pick<StoredToken, 'id' | 'tokenHash'>): string {
  return typeof record.id === 'string' && record.id ? record.id : `h_${record.tokenHash.slice(0, 12)}`;
}

export function sanitizeGoogleId(raw: string): string {
  return (raw || '').replace(/[^a-zA-Z0-9_.-]/g, '');
}

export function parseExpiresAt(expiresAt: unknown): string | null {
  if (expiresAt == null || expiresAt === '') return null;
  if (typeof expiresAt !== 'string') return null;
  const d = new Date(expiresAt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function parseRequestedTokenScope(raw: unknown): TokenScope {
  if (raw === undefined || raw === null || raw === '') return 'write';
  if (raw === 'read' || raw === 'write') return raw;
  throw new Error('Invalid token scope. Use "read" or "write".');
}

export function generateAIToken(googleId: string, expiresAt: string | null, scope: TokenScope): { token: string } {
  const token = `atkn_${crypto.randomBytes(24).toString('base64url')}`;
  const tokenHash = sha256Hex(token);
  const store = readTokenStore();
  const record: StoredToken = {
    id: crypto.randomUUID(),
    tokenHash,
    googleId,
    createdAt: new Date().toISOString(),
    expiresAt,
    scope,
  };
  store.tokens.push(record);
  writeTokenStore(store);
  return { token };
}

export type LoginTokenResult =
  | { ok: true; googleId: string; expiresAt: string | null; scope: TokenScope; tokenId: string }
  | { ok: false; status: number; error: string };

export function loginWithTokenBody(token: string): LoginTokenResult {
  const tokenHash = sha256Hex(token);
  const store = readTokenStore();
  const match = store.tokens.find((t) => {
    try {
      return safeEqualHex(t.tokenHash, tokenHash);
    } catch {
      return false;
    }
  });
  if (!match) return { ok: false, status: 401, error: 'invalid token' };
  if (match.expiresAt) {
    const exp = new Date(match.expiresAt).getTime();
    if (!Number.isNaN(exp) && Date.now() > exp) {
      return { ok: false, status: 401, error: 'token expired' };
    }
  }
  return {
    ok: true,
    googleId: match.googleId,
    expiresAt: match.expiresAt,
    scope: match.scope,
    tokenId: syncTokenIdFromStoredRecord(match),
  };
}

function headerString(
  headers: express.Request['headers'] | IncomingHttpHeaders,
  name: string
): string {
  const h = headers as Record<string, string | string[] | undefined>;
  const v = h[name.toLowerCase()] ?? h[name];
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v[0] ?? '';
  return '';
}

/** อ่าน Bearer / x-archtown-token จาก headers (Express หรือ Node IncomingMessage). */
export function extractTokenFromHeaders(
  headers: express.Request['headers'] | IncomingHttpHeaders
): string | null {
  const auth = headerString(headers, 'authorization');
  if (auth) {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m) return m[1].trim();
  }
  const x = headerString(headers, 'x-archtown-token') || headerString(headers, 'x-token');
  if (x) {
    const t = x.trim();
    return t || null;
  }
  return null;
}

export function extractTokenFromRequest(req: Pick<express.Request, 'headers'>): string | null {
  return extractTokenFromHeaders(req.headers);
}

export function verifySyncToken(token: string): SyncAuth {
  const tokenHash = sha256Hex(token);
  const store = readTokenStore();
  const match = store.tokens.find((t) => {
    try {
      return safeEqualHex(t.tokenHash, tokenHash);
    } catch {
      return false;
    }
  });
  if (!match) {
    const err = new Error('invalid token');
    (err as Error & { status?: number }).status = 401;
    throw err;
  }
  if (match.expiresAt) {
    const exp = new Date(match.expiresAt).getTime();
    if (!Number.isNaN(exp) && Date.now() > exp) {
      const err = new Error('token expired');
      (err as Error & { status?: number }).status = 401;
      throw err;
    }
  }
  const tokenId = syncTokenIdFromStoredRecord(match);
  return { tokenHash: match.tokenHash, tokenId, googleId: match.googleId, scope: match.scope };
}

/**
 * เลือก user สำหรับ sync/audit: มี token ที่ถูกต้อง → googleId จาก store; ไม่มี → header/query; token ผิด → throw (status 401).
 * ใช้ร่วมกับ Vite dev middleware ที่ไม่มี req.syncAuth
 */
export function resolveSyncUserFromIncomingLike(input: {
  headers: express.Request['headers'] | IncomingHttpHeaders;
  query?: express.Request['query'];
  url?: string;
}): { userId: string; syncAuth: SyncAuth } | { userId: string; syncAuth?: undefined } {
  const token = extractTokenFromHeaders(input.headers);
  if (token) {
    const syncAuth = verifySyncToken(token);
    return { userId: syncAuth.googleId, syncAuth };
  }
  return { userId: getSyncUserIdFromIncoming(input) };
}

/** หลัง optionalSyncTokenMiddleware: user สำหรับไฟล์ backup (โทเค็นชนะ header). */
export function getResolvedSyncUserId(req: express.Request): string {
  return req.syncAuth?.googleId ?? getSyncUserId(req);
}
