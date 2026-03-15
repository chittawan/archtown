export const AUTH_ID_TOKEN_KEY = 'archtown_id_token';
const GOOGLE_OAUTH_NONCE_KEY = 'archtown_google_oauth_nonce';

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
  return !!sessionStorage.getItem(AUTH_ID_TOKEN_KEY);
}

export function logoutGoogle(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(AUTH_ID_TOKEN_KEY);
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
  const payload = decodeIdTokenPayload();
  return payload?.sub ?? null;
}

/** Decode id_token and return picture + email for avatar/initial. */
export function getGoogleUserInfo(): { picture?: string; email?: string } {
  const payload = decodeIdTokenPayload();
  if (!payload) return {};
  return { picture: payload.picture, email: payload.email };
}

/** สร้างตัวอักษร 2 ตัวจาก email สำหรับใช้เป็น initial (เช่น chittawan.ris@gmail.com → CH). */
export function emailInitials(email: string): string {
  const s = (email || '').trim();
  if (s.length >= 2) return s.slice(0, 2).toUpperCase();
  if (s.length === 1) return s.toUpperCase();
  return '?';
}
