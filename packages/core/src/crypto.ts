import { p256 } from '@noble/curves/nist.js';

/**
 * Sign a message using ECDSA-P256-SHA256.
 * p256.sign() internally hashes with SHA-256 — do NOT pre-hash.
 * Returns raw r||s signature (64 bytes).
 */
export function signMessage(privateKey: Uint8Array, message: Uint8Array): Uint8Array {
  return p256.sign(message, privateKey, { lowS: true });
}

/**
 * Verify an ECDSA-P256-SHA256 signature.
 * p256.verify() internally hashes with SHA-256 — do NOT pre-hash.
 * Expects raw r||s signature (64 bytes) and compressed public key (33 bytes).
 */
export function verifyMessage(
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array,
): boolean {
  try {
    return p256.verify(signature, message, publicKey, { lowS: true });
  } catch {
    return false;
  }
}
