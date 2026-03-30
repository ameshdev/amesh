import { describe, it, expect } from 'vitest';
import { deriveKey } from '../hkdf.js';

const ikm = new Uint8Array(32).fill(0xab);

describe('deriveKey', () => {
  it('returns 32 bytes by default', () => {
    const key = deriveKey(ikm, 'salt', 'info');
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(32);
  });

  it('returns custom length', () => {
    const key16 = deriveKey(ikm, 'salt', 'info', 16);
    expect(key16.length).toBe(16);

    const key64 = deriveKey(ikm, 'salt', 'info', 64);
    expect(key64.length).toBe(64);
  });

  it('is deterministic', () => {
    const key1 = deriveKey(ikm, 'salt', 'info');
    const key2 = deriveKey(ikm, 'salt', 'info');
    expect(key1).toEqual(key2);
  });

  it('differs with different IKM', () => {
    const ikm2 = new Uint8Array(32).fill(0xcd);
    const key1 = deriveKey(ikm, 'salt', 'info');
    const key2 = deriveKey(ikm2, 'salt', 'info');
    expect(key1).not.toEqual(key2);
  });

  it('differs with different salt', () => {
    const key1 = deriveKey(ikm, 'salt-a', 'info');
    const key2 = deriveKey(ikm, 'salt-b', 'info');
    expect(key1).not.toEqual(key2);
  });

  it('differs with different info', () => {
    const key1 = deriveKey(ikm, 'salt', 'info-a');
    const key2 = deriveKey(ikm, 'salt', 'info-b');
    expect(key1).not.toEqual(key2);
  });

  // Domain separation: the amesh HMAC key derivation uses specific salt/info
  it('produces correct domain-separated keys for allow list', () => {
    const hmacKey = deriveKey(ikm, 'amesh-allow-list-integrity-v1', 'am_device123');
    expect(hmacKey.length).toBe(32);

    // Different device ID → different HMAC key
    const hmacKey2 = deriveKey(ikm, 'amesh-allow-list-integrity-v1', 'am_other456');
    expect(hmacKey).not.toEqual(hmacKey2);
  });

  // Domain separation: session key derivation uses specific salt
  it('produces correct domain-separated session key', () => {
    const sessionKey = deriveKey(ikm, 'amesh-handshake-v1', 'session-key');
    expect(sessionKey.length).toBe(32);
  });

  it('handles empty salt and info', () => {
    const key = deriveKey(ikm, '', '');
    expect(key.length).toBe(32);
    // Should differ from non-empty salt/info
    const key2 = deriveKey(ikm, 'salt', 'info');
    expect(key).not.toEqual(key2);
  });
});
