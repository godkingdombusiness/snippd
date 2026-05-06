/**
 * neo4jVault.ts
 * AES-256-GCM encryption for sensitive Neo4j node properties.
 *
 * Sensitive props (encrypted at rest):  name, address, exact_price
 * Searchable props (SHA-256 hashed):    normalized_key, brand, category, retailer_key
 *
 * Relationship types are always clear text — graph traversal must not be
 * hindered by encryption.
 *
 * The vault secret is read from EXPO_PUBLIC_FIELD_ENC_KEY (client-side) or
 * FIELD_ENC_KEY (server-side Node.js services).
 *
 * Usage:
 *   const vaulted = await vaultifyProps(rawProps);
 *   // { name_enc, brand_hash, category_hash, ... }
 *   session.run('MERGE (p:Product {normalized_key_hash: $nkHash}) SET p += $props', {
 *     nkHash: vaulted.normalized_key_hash,
 *     props:  vaulted,
 *   });
 */

// ── Secret resolution ──────────────────────────────────────────────────────

/** Resolves the field encryption secret from env. Throws if empty. */
function _getSecret(): string {
  // React Native (Expo): EXPO_PUBLIC_FIELD_ENC_KEY
  // Node.js services:    FIELD_ENC_KEY
  const secret =
    (typeof process !== 'undefined' && process.env?.FIELD_ENC_KEY) ||
    (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_FIELD_ENC_KEY) ||
    '';
  if (!secret) throw new Error('neo4jVault: FIELD_ENC_KEY is not set');
  return secret;
}

// ── AES-256-GCM helpers (Web Crypto — available in Expo SDK 50+) ───────────

async function _keyFromSecret(secret: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

function _b64enc(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function _b64dec(s: string): ArrayBuffer {
  const b = atob(s);
  const a = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
  return a.buffer;
}

/**
 * Encrypts a string value with AES-256-GCM.
 * Returns "<iv_b64>:<ciphertext_b64>" or throws on failure.
 */
export async function vaultEncrypt(value: string): Promise<string> {
  const secret = _getSecret();
  const key    = await _keyFromSecret(secret);
  const iv     = crypto.getRandomValues(new Uint8Array(12));
  const ct     = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(value),
  );
  return `${_b64enc(iv.buffer)}:${_b64enc(ct)}`;
}

/**
 * Decrypts a "<iv_b64>:<ciphertext_b64>" blob produced by vaultEncrypt.
 * Returns the original string, or null on any failure (wrong key, tampered).
 */
export async function vaultDecrypt(sealed: string): Promise<string | null> {
  try {
    const secret = _getSecret();
    const [ivB64, ctB64] = sealed.split(':');
    if (!ivB64 || !ctB64) return null;
    const key   = await _keyFromSecret(secret);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(_b64dec(ivB64)) },
      key,
      _b64dec(ctB64),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

// ── SHA-256 hash helpers ───────────────────────────────────────────────────

/**
 * Returns a lowercase hex SHA-256 hash of a value.
 * Used for searchable/indexed fields — the hash is stored instead of the
 * raw value so the graph can be traversed without decrypting.
 *
 * Uses Web Crypto API (available in Node.js 18+, React Native via Hermes,
 * and Expo SDK 50+) — no external dependency required.
 */
export async function hashForIndex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value.toLowerCase().trim()),
  );
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Vault property transformer ─────────────────────────────────────────────

export interface RawProductProps {
  normalized_key: string;
  name:           string;
  brand?:         string | null;
  category?:      string | null;
  retailer_key?:  string | null;
  // address and exact_price are future-proofed here
  address?:       string | null;
  exact_price?:   number | null;
}

export interface VaultedProductProps {
  /** SHA-256 of normalized_key — used as the MERGE key in Neo4j constraints */
  normalized_key_hash: string;
  /** AES-256-GCM encrypted name */
  name_enc:            string;
  /** SHA-256 of brand — used for indexed lookups */
  brand_hash?:         string;
  /** SHA-256 of category */
  category_hash?:      string;
  /** SHA-256 of retailer_key */
  retailer_key_hash?:  string;
  /** AES-256-GCM encrypted address (if present) */
  address_enc?:        string;
  /** AES-256-GCM encrypted exact_price as string (if present) */
  exact_price_enc?:    string;
}

/**
 * Transforms raw product props into vault-safe form for Neo4j writes.
 * Encrypts sensitive fields; hashes searchable/indexed fields.
 * Relationship types are NOT processed here — always pass them through as-is.
 */
export async function vaultifyProps(raw: RawProductProps): Promise<VaultedProductProps> {
  const [
    normalized_key_hash,
    name_enc,
    brand_hash,
    category_hash,
    retailer_key_hash,
    address_enc,
    exact_price_enc,
  ] = await Promise.all([
    hashForIndex(raw.normalized_key),
    vaultEncrypt(raw.name),
    raw.brand      ? hashForIndex(raw.brand)                        : Promise.resolve(undefined),
    raw.category   ? hashForIndex(raw.category)                     : Promise.resolve(undefined),
    raw.retailer_key ? hashForIndex(raw.retailer_key)               : Promise.resolve(undefined),
    raw.address    ? vaultEncrypt(raw.address)                      : Promise.resolve(undefined),
    raw.exact_price != null ? vaultEncrypt(String(raw.exact_price)) : Promise.resolve(undefined),
  ]);

  const result: VaultedProductProps = { normalized_key_hash, name_enc };
  if (brand_hash)       result.brand_hash       = brand_hash;
  if (category_hash)    result.category_hash    = category_hash;
  if (retailer_key_hash) result.retailer_key_hash = retailer_key_hash;
  if (address_enc)      result.address_enc      = address_enc;
  if (exact_price_enc)  result.exact_price_enc  = exact_price_enc;
  return result;
}
