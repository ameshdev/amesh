import { p256 } from '@noble/curves/nist.js';
import { deriveKey } from './hkdf.js';

const HANDSHAKE_SALT = 'amesh-handshake-v1';

/**
 * Generate an ephemeral P-256 keypair for ECDH key exchange.
 * These keys are throwaway — used only for a single handshake session.
 */
export function generateEphemeralKeyPair(): {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
} {
  const privateKey = p256.utils.randomSecretKey();
  const publicKey = p256.getPublicKey(privateKey, true); // compressed
  return { privateKey, publicKey };
}

/**
 * Compute P-256 ECDH shared secret.
 */
export function computeSharedSecret(
  myPrivateKey: Uint8Array,
  theirPublicKey: Uint8Array,
): Uint8Array {
  return p256.getSharedSecret(myPrivateKey, theirPublicKey, true);
}

/**
 * Derive a session key from ECDH shared secret using HKDF-SHA256.
 * Used for ChaCha20-Poly1305 tunnel encryption during handshake.
 */
export function deriveSessionKey(sharedSecret: Uint8Array): Uint8Array {
  return deriveKey(sharedSecret, HANDSHAKE_SALT, 'session-key', 32);
}
