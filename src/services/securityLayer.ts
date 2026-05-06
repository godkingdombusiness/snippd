/**
 * SecurityLayer — AES-256-GCM encryption + input sanitization.
 *
 * Encryption:
 *   Uses the Web Crypto API (SubtleCrypto) which is available in
 *   React Native 0.72+ / Expo 50+ via the global `crypto.subtle` object.
 *   Keys are generated once per installation and stored in expo-secure-store
 *   under the key SECURITY_LAYER_KEY. If the key is absent, a new one is
 *   generated and persisted automatically.
 *
 *   Cipher: AES-GCM, 256-bit key, 96-bit random IV per operation.
 *   Output: base64-encoded "<iv>:<ciphertext>" string — safe for JSONB storage.
 *
 * Sanitization:
 *   sanitizeHuntQuery() strips SQL/NoSQL injection patterns, control characters,
 *   excessive whitespace, and enforces a maximum length. This runs synchronously
 *   on every Hunt bar submission before the query reaches the DB or AI layer.
 */

import * as SecureStore from 'expo-secure-store';

// ── Constants ────────────────────────────────────────────────────────────────

const SECURE_KEY_NAME = 'snippd_security_layer_key_v1';
const HUNT_MAX_LENGTH = 120;

// ── Helpers ──────────────────────────────────────────────────────────────────

function base64Encode(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64Decode(str: string): ArrayBuffer {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// ── Key management ────────────────────────────────────────────────────────────

let _cachedKey: CryptoKey | null = null;

/**
 * Returns the AES-256-GCM CryptoKey for this installation.
 * Generates and persists it on first call; loads from SecureStore on subsequent calls.
 */
async function getEncryptionKey(): Promise<CryptoKey> {
  if (_cachedKey) return _cachedKey;

  const stored = await SecureStore.getItemAsync(SECURE_KEY_NAME);
  if (stored) {
    const rawKey = base64Decode(stored);
    _cachedKey = await crypto.subtle.importKey(
      'raw', rawKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    return _cachedKey;
  }

  // Generate fresh key
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
  const exported = await crypto.subtle.exportKey('raw', key);
  await SecureStore.setItemAsync(SECURE_KEY_NAME, base64Encode(exported));
  _cachedKey = key;
  return _cachedKey;
}

// ── Encryption / Decryption ───────────────────────────────────────────────────

/**
 * Encrypts a JSON-serialisable value with AES-256-GCM.
 * Returns a "<iv_b64>:<ciphertext_b64>" string safe for DB storage.
 */
export async function encrypt(value: unknown): Promise<string> {
  const key = await getEncryptionKey();
  const iv  = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
  const enc = new TextEncoder();
  const plaintext = enc.encode(JSON.stringify(value));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext,
  );

  return `${base64Encode(iv.buffer)}:${base64Encode(ciphertext)}`;
}

/**
 * Decrypts a "<iv_b64>:<ciphertext_b64>" string produced by `encrypt()`.
 * Returns the original value, or null if decryption fails.
 */
export async function decrypt<T = unknown>(sealed: string): Promise<T | null> {
  try {
    const key = await getEncryptionKey();
    const [ivB64, ctB64] = sealed.split(':');
    if (!ivB64 || !ctB64) return null;

    const iv         = base64Decode(ivB64);
    const ciphertext = base64Decode(ctB64);

    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      key,
      ciphertext,
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch {
    return null;
  }
}

// ── Input Sanitization ────────────────────────────────────────────────────────

/**
 * Patterns that indicate SQL/NoSQL injection or script injection attempts.
 * Applied before any Hunt query touches the DB or AI layer.
 */
const INJECTION_PATTERNS = [
  /['";\\]/g,                          // SQL quote/escape chars
  /--+/g,                              // SQL comment
  /\/\*/g,                             // block comment open
  /\*\//g,                             // block comment close
  /\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|CAST|CONVERT)\b/gi,
  /\$\{[^}]*\}/g,                      // template injection ${...}
  /<[^>]*>/g,                          // HTML/XML tags
  /javascript:/gi,                     // JS URL injection
  /on\w+\s*=/gi,                       // HTML event handlers
];

/**
 * Sanitizes a Hunt query string for safe use in Supabase queries and AI prompts.
 *
 * - Strips injection patterns
 * - Removes control characters (except space)
 * - Normalises whitespace
 * - Truncates to HUNT_MAX_LENGTH
 * - Returns the cleaned string; throws `SecurityError` if the input is empty after cleaning
 */
export function sanitizeHuntQuery(raw: string): string {
  if (typeof raw !== 'string') throw new SecurityError('Hunt query must be a string');

  let cleaned = raw;

  // Strip injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    cleaned = cleaned.replace(pattern, ' ');
  }

  // Remove non-printable / control characters (keep normal space \x20)
  cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, ' ');

  // Collapse runs of whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Enforce length limit
  if (cleaned.length > HUNT_MAX_LENGTH) {
    cleaned = cleaned.slice(0, HUNT_MAX_LENGTH).trim();
  }

  if (!cleaned) throw new SecurityError('Hunt query is empty after sanitization');

  return cleaned;
}

/**
 * Like `sanitizeHuntQuery` but returns null instead of throwing when the
 * cleaned result is empty. Use in React render paths where throwing is awkward.
 */
export function sanitizeHuntQuerySafe(raw: string): string | null {
  try {
    return sanitizeHuntQuery(raw);
  } catch {
    return null;
  }
}

// ── Shared-secret encrypt / decrypt ──────────────────────────────────────────
//
// These variants derive a 256-bit AES-GCM key from an arbitrary secret string
// via SHA-256.  Both the Deno Edge Function and the React Native client use
// the identical derivation, so a ciphertext written by one can be read by the
// other as long as they share the same STACK_SECRET value.
//
// Usage (client):
//   const secret = process.env.EXPO_PUBLIC_STACK_SECRET ?? '';
//   const blob   = await encryptWithSecret(planObject, secret);
//   const plan   = await decryptWithSecret<GeniusPlan>(blob, secret);
//
// Never pass the raw secret string to AgenticLedger or any log call.

async function keyFromSecret(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(secret));
  return crypto.subtle.importKey(
    'raw', raw,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypts any JSON-serialisable value with a secret-derived AES-256-GCM key.
 * Returns the same "<iv_b64>:<ciphertext_b64>" format as `encrypt()`.
 * The secret is never stored or logged.
 */
export async function encryptWithSecret(value: unknown, secret: string): Promise<string> {
  if (!secret) throw new SecurityError('STACK_SECRET is not set');
  const key = await keyFromSecret(secret);
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ct  = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(JSON.stringify(value)),
  );
  return `${base64Encode(iv.buffer)}:${base64Encode(ct)}`;
}

/**
 * Decrypts a "<iv_b64>:<ciphertext_b64>" blob produced by `encryptWithSecret()`.
 * Returns the original value, or null if decryption fails (wrong key, tampered
 * ciphertext, or missing secret).  Never throws — callers treat null as a
 * signal to fall back to the Foundation Stack.
 */
export async function decryptWithSecret<T = unknown>(
  sealed: string,
  secret: string,
): Promise<T | null> {
  try {
    if (!secret || !sealed) return null;
    const key = await keyFromSecret(secret);
    const [ivB64, ctB64] = sealed.split(':');
    if (!ivB64 || !ctB64) return null;
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(base64Decode(ivB64)) },
      key,
      base64Decode(ctB64),
    );
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  } catch {
    return null;
  }
}

// ── SecurityError ─────────────────────────────────────────────────────────────

export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}
