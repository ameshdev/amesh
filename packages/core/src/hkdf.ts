import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

const encoder = new TextEncoder();

/**
 * Derive a key using HKDF-SHA256.
 *
 * @param ikm - Input keying material
 * @param salt - Salt string (domain separator)
 * @param info - Context/info string
 * @param length - Output key length in bytes (default: 32)
 */
export function deriveKey(
  ikm: Uint8Array,
  salt: string,
  info: string,
  length = 32,
): Uint8Array {
  return hkdf(sha256, ikm, encoder.encode(salt), encoder.encode(info), length);
}
