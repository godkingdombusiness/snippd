// ── Field-Level Encryption (AES-256-GCM) ─────────────────────────────────────
//
// Uses the Web Crypto API (global.crypto.subtle), available in React Native
// 0.71+ with Hermes engine. Keys are derived via PBKDF2 from the app secret
// stored in environment variables — never hard-coded.
//
// Setup: add EXPO_PUBLIC_FIELD_ENC_KEY=<32+ random chars> to your .env
//
// Usage:
//   import { encryptField, decryptField } from '../lib/fieldEncryption';
//   const cipher = await encryptField(user.email);
//   const plain  = await decryptField(cipher);
//
// Storage format: "<base64_iv>:<base64_ciphertext>"

const ENC_SECRET = process.env.EXPO_PUBLIC_FIELD_ENC_KEY;
const SALT       = 'snippd-fle-v1'; // static, non-secret KDF salt
const ITERATIONS = 100_000;

let _cachedKey = null;

async function getDerivedKey() {
  if (_cachedKey) return _cachedKey;

  if (!ENC_SECRET || ENC_SECRET.length < 32) {
    throw new Error(
      'EXPO_PUBLIC_FIELD_ENC_KEY must be set and at least 32 characters long'
    );
  }

  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(ENC_SECRET),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  _cachedKey = await crypto.subtle.deriveKey(
    {
      name:       'PBKDF2',
      salt:       enc.encode(SALT),
      iterations: ITERATIONS,
      hash:       'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  return _cachedKey;
}

function toBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function fromBase64(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

/**
 * Encrypt a plaintext string.
 * @returns {Promise<string>} "<iv_b64>:<ciphertext_b64>"
 */
export async function encryptField(plaintext) {
  if (plaintext === null || plaintext === undefined) return plaintext;
  const key  = await getDerivedKey();
  const iv   = crypto.getRandomValues(new Uint8Array(12)); // 96-bit GCM IV
  const enc  = new TextEncoder().encode(String(plaintext));
  const ct   = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc);
  return `${toBase64(iv)}:${toBase64(ct)}`;
}

/**
 * Decrypt a ciphertext produced by encryptField.
 * @returns {Promise<string>} original plaintext
 */
export async function decryptField(ciphertext) {
  if (!ciphertext || !ciphertext.includes(':')) return ciphertext;
  const [ivB64, ctB64] = ciphertext.split(':');
  const key  = await getDerivedKey();
  const iv   = fromBase64(ivB64);
  const ct   = fromBase64(ctB64);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(plain);
}
