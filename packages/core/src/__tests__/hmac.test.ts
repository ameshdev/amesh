import { describe, it, expect } from 'vitest';
import { computeHmac, verifyHmac } from '../hmac.js';

const key = new TextEncoder().encode('test-key-for-hmac');
const data = new TextEncoder().encode('allow list data');

describe('computeHmac', () => {
  it('returns a 32-byte Uint8Array (SHA-256)', () => {
    const mac = computeHmac(key, data);
    expect(mac).toBeInstanceOf(Uint8Array);
    expect(mac.length).toBe(32);
  });

  it('is deterministic', () => {
    const mac1 = computeHmac(key, data);
    const mac2 = computeHmac(key, data);
    expect(mac1).toEqual(mac2);
  });

  it('differs with different keys', () => {
    const key2 = new TextEncoder().encode('different-key');
    const mac1 = computeHmac(key, data);
    const mac2 = computeHmac(key2, data);
    expect(mac1).not.toEqual(mac2);
  });

  it('differs with different data', () => {
    const data2 = new TextEncoder().encode('different data');
    const mac1 = computeHmac(key, data);
    const mac2 = computeHmac(key, data2);
    expect(mac1).not.toEqual(mac2);
  });
});

describe('verifyHmac', () => {
  it('verifies a correct HMAC', () => {
    const mac = computeHmac(key, data);
    expect(verifyHmac(key, data, mac)).toBe(true);
  });

  it('rejects wrong key', () => {
    const mac = computeHmac(key, data);
    const wrongKey = new TextEncoder().encode('wrong-key');
    expect(verifyHmac(wrongKey, data, mac)).toBe(false);
  });

  it('rejects wrong data', () => {
    const mac = computeHmac(key, data);
    const wrongData = new TextEncoder().encode('tampered data');
    expect(verifyHmac(key, wrongData, mac)).toBe(false);
  });

  it('rejects tampered HMAC (flipped bit)', () => {
    const mac = computeHmac(key, data);
    const tampered = new Uint8Array(mac);
    tampered[0] ^= 0x01;
    expect(verifyHmac(key, data, tampered)).toBe(false);
  });

  it('rejects truncated HMAC', () => {
    const mac = computeHmac(key, data);
    const truncated = mac.slice(0, 16);
    expect(verifyHmac(key, data, truncated)).toBe(false);
  });

  it('rejects empty HMAC', () => {
    expect(verifyHmac(key, data, new Uint8Array(0))).toBe(false);
  });

  it('rejects wrong-length HMAC', () => {
    expect(verifyHmac(key, data, new Uint8Array(31))).toBe(false);
    expect(verifyHmac(key, data, new Uint8Array(33))).toBe(false);
  });

  it('rejects all-zero HMAC of correct length', () => {
    expect(verifyHmac(key, data, new Uint8Array(32))).toBe(false);
  });

  // Adversarial: allow list tamper detection scenario
  it('detects allow list tampering', () => {
    const allowList = new TextEncoder().encode(
      JSON.stringify({ devices: [{ id: 'am_abc123' }] }),
    );
    const seal = computeHmac(key, allowList);
    expect(verifyHmac(key, allowList, seal)).toBe(true);

    // Attacker modifies allow list
    const tampered = new TextEncoder().encode(
      JSON.stringify({ devices: [{ id: 'am_abc123' }, { id: 'am_evil' }] }),
    );
    expect(verifyHmac(key, tampered, seal)).toBe(false);
  });
});
