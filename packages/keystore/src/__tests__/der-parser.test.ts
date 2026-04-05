import { describe, it, expect } from 'bun:test';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { p256 } from '@noble/curves/nist.js';
import { derToRaw } from '../drivers/macos-keychain.js';

/**
 * Regression tests for L4 — macOS keychain driver's DER signature parser
 * used to walk `der[i]` blindly. A malformed DER blob (from a tampered or
 * buggy helper binary) could index out-of-range or produce a garbage
 * 64-byte output. Every field access is now bounds-checked.
 */
describe('derToRaw DER signature parser (L4)', () => {
  // Generate a real ECDSA-P256 DER signature by signing a message with
  // Node's crypto (which emits DER) and feeding the output to derToRaw.
  function realDerSig(): Uint8Array {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const signer = createSign('SHA256');
    signer.update('hello');
    return new Uint8Array(signer.sign(privateKey));
  }

  it('converts a real DER ECDSA signature to 64-byte raw r||s', () => {
    const der = realDerSig();
    const raw = derToRaw(der);
    expect(raw.length).toBe(64);
    // r and s must each be valid P-256 scalars: 0 < x < n.
    const n = BigInt('0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551');
    const r = BigInt('0x' + Buffer.from(raw.subarray(0, 32)).toString('hex'));
    const s = BigInt('0x' + Buffer.from(raw.subarray(32)).toString('hex'));
    expect(r > 0n && r < n).toBe(true);
    expect(s > 0n && s < n).toBe(true);
    // Low-S normalization: s must be <= n/2
    expect(s <= n / 2n).toBe(true);
  });

  it('round-trips: output verifies against the signing pub key', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const signer = createSign('SHA256');
    signer.update('integration');
    const der = new Uint8Array(signer.sign(privateKey));
    const raw = derToRaw(der);

    // Extract compressed pubkey from SPKI DER
    const spki = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
    // P-256 SPKI: last 65 bytes are the uncompressed point
    const uncompressed = new Uint8Array(spki.subarray(spki.length - 65));
    const compressed = p256.Point.fromHex(Buffer.from(uncompressed).toString('hex')).toBytes(true);

    const message = new TextEncoder().encode('integration');
    expect(p256.verify(raw, message, compressed, { lowS: true })).toBe(true);
  });

  it('throws on empty input', () => {
    expect(() => derToRaw(new Uint8Array(0))).toThrow('too short');
  });

  it('throws on buffer missing SEQUENCE tag', () => {
    const bad = new Uint8Array(10);
    bad[0] = 0x02; // INTEGER, not SEQUENCE
    expect(() => derToRaw(bad)).toThrow('SEQUENCE tag');
  });

  it('throws on long-form SEQUENCE length (not valid for P-256)', () => {
    // 0x30 SEQUENCE, 0x81 (long-form, 1 length byte), 0x46 (70), then 70 bytes
    // of placeholder payload so we get past the "signature too short" check
    // and into the SEQUENCE-length validation branch.
    const bad = new Uint8Array(73);
    bad[0] = 0x30;
    bad[1] = 0x81;
    bad[2] = 0x46;
    expect(() => derToRaw(bad)).toThrow(/long-form/i);
  });

  it('throws on truncated SEQUENCE length', () => {
    // Claims length 100 but buffer is only 8 bytes total.
    const bad = new Uint8Array([0x30, 0x64, 0x02, 0x01, 0x01, 0x02, 0x01, 0x01]);
    expect(() => derToRaw(bad)).toThrow(/overflows buffer/);
  });

  it('throws when r integer tag is missing', () => {
    //              30  len   ??  rlen ...
    const bad = new Uint8Array([0x30, 0x06, 0x05, 0x01, 0xff, 0x02, 0x01, 0x01]);
    expect(() => derToRaw(bad)).toThrow(/INTEGER tag for r/);
  });

  it('throws when r length is absurd (33+)', () => {
    // Build a SEQUENCE with r length = 40 (impossible for P-256)
    const bad = new Uint8Array(50);
    bad[0] = 0x30; bad[1] = 48;
    bad[2] = 0x02; bad[3] = 40; // r length = 40, invalid
    expect(() => derToRaw(bad)).toThrow(/r length out of range/);
  });

  it('throws when r overflows the buffer', () => {
    // 10-byte buffer. SEQUENCE length claims 8, INTEGER r claims length 32.
    // Buffer has room for only ~6 bytes of r → overflow.
    const bad = new Uint8Array(10);
    bad[0] = 0x30;
    bad[1] = 0x08;
    bad[2] = 0x02;
    bad[3] = 0x20; // r length = 32, but only 6 bytes remain
    // The SEQUENCE length guard (2 + 8 > 10 is false) lets us through; the
    // "r overflows buffer" guard (i + rLen > der.length) fires.
    expect(() => derToRaw(bad)).toThrow(/r overflows buffer/);
  });

  it('throws when s tag is missing after r', () => {
    const bad = new Uint8Array(10);
    bad[0] = 0x30; bad[1] = 0x08;
    bad[2] = 0x02; bad[3] = 0x01; bad[4] = 0x01; // r = [0x01]
    bad[5] = 0x05; // not 0x02 where s tag should be
    expect(() => derToRaw(bad)).toThrow(/INTEGER tag for s/);
  });
});
