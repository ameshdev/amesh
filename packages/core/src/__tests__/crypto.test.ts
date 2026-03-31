import { describe, it, expect } from 'vitest';
import { p256 } from '@noble/curves/nist.js';
import { signMessage, verifyMessage } from '../crypto.js';

function makeKeyPair() {
  const privateKey = p256.utils.randomSecretKey();
  const publicKey = p256.getPublicKey(privateKey, true);
  return { privateKey, publicKey };
}

const msg = new TextEncoder().encode('hello amesh');

describe('signMessage', () => {
  it('returns a 64-byte Uint8Array (compact r||s)', () => {
    const { privateKey } = makeKeyPair();
    const sig = signMessage(privateKey, msg);
    expect(sig).toBeInstanceOf(Uint8Array);
    expect(sig.length).toBe(64);
  });

  it('produces different signatures for different messages', () => {
    const { privateKey } = makeKeyPair();
    const sig1 = signMessage(privateKey, msg);
    const sig2 = signMessage(privateKey, new TextEncoder().encode('different'));
    expect(sig1).not.toEqual(sig2);
  });

  it('produces different signatures with different keys', () => {
    const key1 = makeKeyPair();
    const key2 = makeKeyPair();
    const sig1 = signMessage(key1.privateKey, msg);
    const sig2 = signMessage(key2.privateKey, msg);
    expect(sig1).not.toEqual(sig2);
  });
});

describe('verifyMessage', () => {
  it('verifies a valid signature', () => {
    const { privateKey, publicKey } = makeKeyPair();
    const sig = signMessage(privateKey, msg);
    expect(verifyMessage(sig, msg, publicKey)).toBe(true);
  });

  it('rejects signature with wrong message', () => {
    const { privateKey, publicKey } = makeKeyPair();
    const sig = signMessage(privateKey, msg);
    const wrong = new TextEncoder().encode('wrong message');
    expect(verifyMessage(sig, wrong, publicKey)).toBe(false);
  });

  it('rejects signature with wrong public key', () => {
    const key1 = makeKeyPair();
    const key2 = makeKeyPair();
    const sig = signMessage(key1.privateKey, msg);
    expect(verifyMessage(sig, msg, key2.publicKey)).toBe(false);
  });

  it('rejects a tampered signature (flipped bit)', () => {
    const { privateKey, publicKey } = makeKeyPair();
    const sig = signMessage(privateKey, msg);
    const tampered = new Uint8Array(sig);
    tampered[0] ^= 0x01;
    expect(verifyMessage(tampered, msg, publicKey)).toBe(false);
  });

  it('rejects a truncated signature', () => {
    const { privateKey, publicKey } = makeKeyPair();
    const sig = signMessage(privateKey, msg);
    const truncated = sig.slice(0, 32);
    expect(verifyMessage(truncated, msg, publicKey)).toBe(false);
  });

  it('rejects garbage bytes', () => {
    const { publicKey } = makeKeyPair();
    const garbage = new Uint8Array(64).fill(0xff);
    expect(verifyMessage(garbage, msg, publicKey)).toBe(false);
  });

  it('rejects an empty signature', () => {
    const { publicKey } = makeKeyPair();
    expect(verifyMessage(new Uint8Array(0), msg, publicKey)).toBe(false);
  });

  it('handles empty message', () => {
    const { privateKey, publicKey } = makeKeyPair();
    const empty = new Uint8Array(0);
    const sig = signMessage(privateKey, empty);
    expect(verifyMessage(sig, empty, publicKey)).toBe(true);
    expect(verifyMessage(sig, msg, publicKey)).toBe(false);
  });
});

describe('sign + verify round-trip', () => {
  it('works for 100 random keypairs', () => {
    for (let i = 0; i < 100; i++) {
      const { privateKey, publicKey } = makeKeyPair();
      const payload = new TextEncoder().encode(`message-${i}`);
      const sig = signMessage(privateKey, payload);
      expect(verifyMessage(sig, payload, publicKey)).toBe(true);
    }
  });
});
