/**
 * Encrypt/decrypt sync payload (JSON) with Web Crypto API for Cloud Sync.
 * Uses AES-GCM and PBKDF2 for key derivation. Password is never sent to server.
 */

const PBKDF2_ITERATIONS = 250_000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 256;

export interface EncryptedPayload {
  enc: string;
  iv: string;
  salt: string;
}

/**
 * Derive an AES-GCM key from password and salt using PBKDF2.
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt plain JSON string for sync upload. Returns base64-encoded enc, iv, salt.
 */
export async function encryptPayload(
  plainJson: string,
  password: string
): Promise<{ encrypted: ArrayBuffer; iv: Uint8Array; salt: Uint8Array }> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(password, salt);

  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    enc.encode(plainJson)
  );

  return { encrypted: ciphertext, iv, salt };
}

/**
 * Build the encrypted sync payload object. Only schema_version + tables are encrypted;
 * version and updated_at are kept outside for server-side conflict check.
 */
export function buildEncryptedSyncPayload(
  plainPayload: { schema_version: number; version?: number; updated_at?: string; tables: Record<string, unknown[]> },
  encrypted: ArrayBuffer,
  iv: Uint8Array,
  salt: Uint8Array
): Record<string, string | number | undefined> {
  const encBase64 = btoa(String.fromCharCode(...new Uint8Array(encrypted)));
  const ivBase64 = btoa(String.fromCharCode(...iv));
  const saltBase64 = btoa(String.fromCharCode(...salt));
  return {
    version: plainPayload.version,
    updated_at: plainPayload.updated_at,
    enc: encBase64,
    iv: ivBase64,
    salt: saltBase64,
  };
}

/** Inner payload shape (encrypted). */
export interface EncryptedInnerPayload {
  schema_version: number;
  tables: Record<string, Record<string, unknown>[]>;
}

/**
 * Merge decrypted inner payload with wrapper's version/updated_at for full SyncExportPayload.
 */
export function mergeDecryptedWithMeta(
  inner: EncryptedInnerPayload,
  version: number | undefined,
  updated_at: string | undefined
): { schema_version: number; version?: number; updated_at?: string; tables: Record<string, Record<string, unknown>[]> } {
  return { ...inner, version, updated_at };
}

/**
 * Decrypt payload. encrypted is the raw ArrayBuffer of ciphertext (from base64 dec).
 */
export async function decryptPayload(
  encrypted: ArrayBuffer,
  iv: Uint8Array,
  password: string,
  salt: Uint8Array
): Promise<string> {
  const key = await deriveKey(password, salt);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    encrypted
  );
  return new TextDecoder().decode(decrypted);
}

/**
 * Check if a sync response payload is encrypted (has enc, iv, salt).
 */
export function isEncryptedPayload(
  payload: Record<string, unknown>
): payload is Record<string, unknown> & { enc: string; iv: string; salt: string } {
  return (
    typeof payload.enc === 'string' &&
    typeof payload.iv === 'string' &&
    typeof payload.salt === 'string'
  );
}

/**
 * Decode base64 to Uint8Array.
 */
export function base64ToBytes(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Decode base64 to ArrayBuffer.
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  return base64ToBytes(base64).buffer;
}
