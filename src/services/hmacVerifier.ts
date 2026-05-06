/**
 * hmacVerifier.ts
 * Client-side HMAC-SHA256 verification for plan integrity.
 * Verifies the HMAC signature returned by the get-weekly-plan Edge Function
 * before the plan ciphertext is decrypted. Prevents tampered ciphertext
 * from being fed into the decryption pipeline.
 */

/**
 * Derives an HMAC-SHA256 key from a UTF-8 secret string.
 */
async function _hmacKey(secret: string): Promise<CryptoKey> {
  const keyMaterial = new TextEncoder().encode(secret);
  return crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/**
 * Computes HMAC-SHA256 of a message using the provided secret.
 * Returns lowercase hex string.
 */
async function _computeHmac(message: string, secret: string): Promise<string> {
  const key = await _hmacKey(secret);
  const msgBytes = new TextEncoder().encode(message);
  const sigBytes = await crypto.subtle.sign('HMAC', key, msgBytes);
  return Array.from(new Uint8Array(sigBytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Constant-time hex string comparison to prevent timing attacks.
 * Returns true only if both strings are equal length and every character matches.
 */
function _safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Verifies the HMAC-SHA256 signature of a plan envelope ciphertext.
 *
 * @param ciphertext - The raw ciphertext string from the plan envelope
 * @param receivedHmac - The HMAC hex string returned alongside the ciphertext
 * @param secret - The HMAC_SECRET (EXPO_PUBLIC_HMAC_SECRET)
 * @returns true if signature is valid, false otherwise
 */
export async function verifyPlanHmac(
  ciphertext: string,
  receivedHmac: string,
  secret: string,
): Promise<boolean> {
  if (!secret || !ciphertext || !receivedHmac) return false;
  try {
    const expected = await _computeHmac(ciphertext, secret);
    return _safeCompare(expected, receivedHmac.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Signs a ciphertext string with HMAC-SHA256.
 * Used in tests to generate expected HMACs.
 *
 * @param ciphertext - The ciphertext to sign
 * @param secret - The HMAC secret
 * @returns hex HMAC string
 */
export async function signCiphertext(ciphertext: string, secret: string): Promise<string> {
  return _computeHmac(ciphertext, secret);
}
