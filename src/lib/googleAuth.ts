export const AUTH_ID_TOKEN_KEY = 'archtown_id_token';
const GOOGLE_OAUTH_NONCE_KEY = 'archtown_google_oauth_nonce';
const TOKEN_LOGIN_USER_ID_KEY = 'archtown_token_google_user_id';
const TOKEN_LOGIN_TOKEN_KEY = 'archtown_token_login_token';
/** ตรงกับ server actor \`ai:<tokenId>\` — ใช้ skip SSE patch ที่ self-issued */
const TOKEN_LOGIN_SYNC_TOKEN_ID_KEY = 'archtown_token_login_sync_token_id';
const TOKEN_LOGIN_EMAIL_KEY = 'archtown_token_email';
const TOKEN_LOGIN_PICTURE_KEY = 'archtown_token_picture';

export function getGoogleClientId(): string {
  return (import.meta as unknown as { env?: { VITE_GOOGLE_CLIENT_ID?: string } }).env?.VITE_GOOGLE_CLIENT_ID ||
    '60952350427-4ofd51gm33p3dg0hfub8n1pqqk90grho.apps.googleusercontent.com';
}

export function buildGoogleRedirectUrl(clientId: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const redirectUri = `${origin}/auth/callback`;
  const nonce = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(GOOGLE_OAUTH_NONCE_KEY, nonce);
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'id_token',
    scope: 'openid email profile',
    nonce,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function redirectToGoogleLogin(): void {
  window.location.href = buildGoogleRedirectUrl(getGoogleClientId());
}

export function isGoogleLoggedIn(): boolean {
  if (typeof window === 'undefined') return false;
  return !!sessionStorage.getItem(AUTH_ID_TOKEN_KEY) || !!sessionStorage.getItem(TOKEN_LOGIN_USER_ID_KEY);
}

export function logoutGoogle(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(AUTH_ID_TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_LOGIN_USER_ID_KEY);
  sessionStorage.removeItem(TOKEN_LOGIN_TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_LOGIN_SYNC_TOKEN_ID_KEY);
  sessionStorage.removeItem(TOKEN_LOGIN_EMAIL_KEY);
  sessionStorage.removeItem(TOKEN_LOGIN_PICTURE_KEY);
}

type GoogleTokenPayload = { sub?: string; email?: string; picture?: string };

function decodeIdTokenPayload(): GoogleTokenPayload | null {
  if (typeof window === 'undefined') return null;
  const token = sessionStorage.getItem(AUTH_ID_TOKEN_KEY);
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64url = parts[1];
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
    const json = atob(padded);
    return JSON.parse(json) as GoogleTokenPayload;
  } catch {
    return null;
  }
}

/** Decode id_token JWT and return Google user id (sub). Used for per-user sync path. */
export function getGoogleUserId(): string | null {
  if (typeof window !== 'undefined') {
    const tokenUserId = sessionStorage.getItem(TOKEN_LOGIN_USER_ID_KEY);
    if (tokenUserId) return tokenUserId;
  }
  const payload = decodeIdTokenPayload();
  return payload?.sub ?? null;
}

/** Decode id_token and return picture + email for avatar/initial. */
export function getGoogleUserInfo(): { picture?: string; email?: string } {
  if (typeof window !== 'undefined') {
    const email = sessionStorage.getItem(TOKEN_LOGIN_EMAIL_KEY) || undefined;
    const picture = sessionStorage.getItem(TOKEN_LOGIN_PICTURE_KEY) || undefined;
    if (email || picture) return { email, picture };
  }
  const payload = decodeIdTokenPayload();
  if (!payload) return {};
  return { picture: payload.picture, email: payload.email };
}

export function setTokenLoginIdentity(input: {
  googleId: string;
  token?: string;
  /** จาก POST /api/auth/token/login — ใช้เทียบกับ SSE actor \`ai:<tokenId>\` เมื่อใช้ write token */
  tokenId?: string | null;
  email?: string;
  picture?: string;
}): void {
  if (typeof window === 'undefined') return;
  const googleId = (input.googleId || '').trim();
  if (!googleId) throw new Error('googleId is required');
  sessionStorage.setItem(TOKEN_LOGIN_USER_ID_KEY, googleId);
  // Keep the raw token so Cloud Sync can enforce rate limiting + scope on server-side.
  if ('token' in input && typeof input.token === 'string' && input.token.trim()) {
    sessionStorage.setItem(TOKEN_LOGIN_TOKEN_KEY, input.token.trim());
    const tid = input.tokenId != null ? String(input.tokenId).trim() : '';
    if (tid) sessionStorage.setItem(TOKEN_LOGIN_SYNC_TOKEN_ID_KEY, tid);
    else sessionStorage.removeItem(TOKEN_LOGIN_SYNC_TOKEN_ID_KEY);
  } else {
    sessionStorage.removeItem(TOKEN_LOGIN_TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_LOGIN_SYNC_TOKEN_ID_KEY);
  }
  if (input.email) sessionStorage.setItem(TOKEN_LOGIN_EMAIL_KEY, input.email);
  else sessionStorage.removeItem(TOKEN_LOGIN_EMAIL_KEY);
  if (input.picture) sessionStorage.setItem(TOKEN_LOGIN_PICTURE_KEY, input.picture);
  else sessionStorage.removeItem(TOKEN_LOGIN_PICTURE_KEY);
}

export function getTokenLoginToken(): string | null {
  if (typeof window === 'undefined') return null;
  const t = sessionStorage.getItem(TOKEN_LOGIN_TOKEN_KEY);
  if (!t) return null;
  return t.trim() || null;
}

/** ค่าที่ต่อเป็น \`ai:\` ใน audit/SSE — มีเฉพาะหลัง token login ที่ API คืน tokenId */
export function getTokenLoginSyncTokenId(): string | null {
  if (typeof window === 'undefined') return null;
  const id = sessionStorage.getItem(TOKEN_LOGIN_SYNC_TOKEN_ID_KEY);
  return id?.trim() || null;
}

export function getLoginKind(): 'google' | 'token' | 'guest' {
  if (typeof window === 'undefined') return 'guest';
  if (sessionStorage.getItem(TOKEN_LOGIN_USER_ID_KEY)) return 'token';
  if (sessionStorage.getItem(AUTH_ID_TOKEN_KEY)) return 'google';
  return 'guest';
}

/** สร้างตัวอักษร 2 ตัวจาก email สำหรับใช้เป็น initial (เช่น chittawan.ris@gmail.com → CH). */
export function emailInitials(email: string): string {
  const s = (email || '').trim();
  if (s.length >= 2) return s.slice(0, 2).toUpperCase();
  if (s.length === 1) return s.toUpperCase();
  return '?';
}
