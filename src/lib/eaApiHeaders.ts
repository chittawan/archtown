import { getGoogleUserId, getTokenLoginToken } from './googleAuth';

/** Headers สำหรับเรียก `/api/ea/*` ให้สอดคล้องกับ sync/audit */
export function eaApiHeaders(): Record<string, string> {
  const userId = getGoogleUserId();
  const token = getTokenLoginToken();
  const h: Record<string, string> = { 'X-Google-User-Id': userId ?? 'guest' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}
