import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';

/**
 * Compute HMAC-SHA256 over data using the given key.
 */
export function computeHmac(key: Uint8Array, data: Uint8Array): Uint8Array {
  return hmac(sha256, key, data);
}

/**
 * Verify HMAC-SHA256 in constant time.
 */
export function verifyHmac(key: Uint8Array, data: Uint8Array, expected: Uint8Array): boolean {
  const computed = computeHmac(key, data);
  if (computed.length !== expected.length) return false;

  // Constant-time comparison to prevent timing attacks
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed[i] ^ expected[i];
  }
  return diff === 0;
}
