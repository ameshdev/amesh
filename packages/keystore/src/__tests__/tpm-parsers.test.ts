import { describe, it, expect } from 'bun:test';
import { generateKeyPairSync } from 'node:crypto';
import { p256 } from '@noble/curves/nist.js';
import { extractSec1PointFromSpki, parseTpmtSignature, pemToRaw } from '../drivers/tpm.js';

/**
 * Regression tests for M7 — TPM driver had two crash-level bugs:
 *
 *   1. pemToRaw returned the full SPKI DER bytes (~91 bytes) instead of a
 *      33-byte compressed P-256 point. The KeyStore interface promises a
 *      33-byte compressed point, so any caller feeding the result into
 *      p256.verify() or the canonical signing chain would fail.
 *
 *   2. tpm2_sign's default output is TPMT_SIGNATURE (a TPM 2.0 structured
 *      format), NOT raw r||s. @noble/curves' verifyMessage expects 64-byte
 *      raw r||s, so every signature from the TPM backend was rejected.
 *
 * These tests exercise the parser helpers in isolation — the TPM subprocess
 * itself can't be run on macOS, but the PEM/DER and TPMT_SIGNATURE formats
 * are deterministic byte structures we can synthesize and verify.
 */

describe('extractSec1PointFromSpki (M7)', () => {
  it('extracts a 65-byte uncompressed SEC1 point from a real SPKI', () => {
    // Generate a real P-256 key and encode it as SPKI using Node's crypto.
    const { publicKey } = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });
    const spkiDer = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
    const point = extractSec1PointFromSpki(new Uint8Array(spkiDer));
    expect(point.length).toBe(65);
    expect(point[0]).toBe(0x04); // uncompressed marker
  });

  it('throws on truncated SPKI', () => {
    expect(() => extractSec1PointFromSpki(new Uint8Array([0x30, 0x05]))).toThrow();
  });

  it('throws when outer tag is not SEQUENCE', () => {
    expect(() => extractSec1PointFromSpki(new Uint8Array(100).fill(0))).toThrow();
  });

  it('throws on a P-384 SPKI (point length mismatch)', () => {
    const { publicKey } = generateKeyPairSync('ec', {
      namedCurve: 'secp384r1',
    });
    const spkiDer = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
    // extractSec1PointFromSpki hard-codes 65 bytes for P-256. P-384 is 97.
    expect(() => extractSec1PointFromSpki(new Uint8Array(spkiDer))).toThrow(/65-byte point/);
  });
});

describe('pemToRaw (M7)', () => {
  it('round-trips a real P-256 public key through PEM to 33-byte compressed', () => {
    const { publicKey } = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });
    const pem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
    const compressed = pemToRaw(pem);
    expect(compressed.length).toBe(33);
    // First byte must be 0x02 or 0x03 (compressed SEC1 marker)
    expect(compressed[0] === 0x02 || compressed[0] === 0x03).toBe(true);

    // Sanity: verify the compressed point is a valid P-256 curve point.
    // (Noble's Point.fromHex throws on invalid points.) We don't do a full
    // sign/verify round-trip here because PKCS8 isn't directly consumable
    // by @noble — the SEC1 point identity alone is what matters.
    expect(() => p256.Point.fromHex(Buffer.from(compressed).toString('hex'))).not.toThrow();

    // Belt and suspenders: strip the PEM and re-extract manually via
    // extractSec1PointFromSpki, then compress via Noble, and compare.
    const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
    const der = new Uint8Array(Buffer.from(b64, 'base64'));
    const uncompressed = extractSec1PointFromSpki(der);
    const expected = p256.Point.fromHex(Buffer.from(uncompressed).toString('hex')).toBytes(true);
    expect(Buffer.from(compressed).equals(Buffer.from(expected))).toBe(true);
  });
});

describe('parseTpmtSignature (M7)', () => {
  function makeTpmtSignature(r: Uint8Array, s: Uint8Array): Uint8Array {
    // Layout:
    //  2 bytes scheme (0x0018 = TPM_ALG_ECDSA)
    //  2 bytes hash alg (0x000B = SHA256, arbitrary for test)
    //  2 bytes size_r, r bytes
    //  2 bytes size_s, s bytes
    const out = new Uint8Array(4 + 2 + r.length + 2 + s.length);
    out[0] = 0x00;
    out[1] = 0x18;
    out[2] = 0x00;
    out[3] = 0x0b;
    out[4] = (r.length >> 8) & 0xff;
    out[5] = r.length & 0xff;
    out.set(r, 6);
    out[6 + r.length] = (s.length >> 8) & 0xff;
    out[7 + r.length] = s.length & 0xff;
    out.set(s, 8 + r.length);
    return out;
  }

  it('extracts r||s as 64 bytes when both are full-length', () => {
    const r = new Uint8Array(32);
    const s = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      r[i] = i + 1;
      s[i] = (i + 1) * 2;
    }
    const tpmt = makeTpmtSignature(r, s);
    const plain = parseTpmtSignature(tpmt);
    expect(plain.length).toBe(64);
    expect(Buffer.from(plain.subarray(0, 32)).equals(Buffer.from(r))).toBe(true);
    expect(Buffer.from(plain.subarray(32)).equals(Buffer.from(s))).toBe(true);
  });

  it('left-pads short r and s to 32 bytes each', () => {
    // TPM may strip leading zero bytes from r or s.
    const r = new Uint8Array([0x01, 0x02, 0x03]); // 3 bytes
    const s = new Uint8Array([0x04, 0x05]); // 2 bytes
    const tpmt = makeTpmtSignature(r, s);
    const plain = parseTpmtSignature(tpmt);
    expect(plain.length).toBe(64);
    // r should be left-padded with zeros, then 01 02 03 at positions 29,30,31
    expect(plain[29]).toBe(0x01);
    expect(plain[30]).toBe(0x02);
    expect(plain[31]).toBe(0x03);
    // s should be left-padded with zeros, then 04 05 at positions 62,63
    expect(plain[62]).toBe(0x04);
    expect(plain[63]).toBe(0x05);
    // All other bytes must be zero
    for (let i = 0; i < 29; i++) expect(plain[i]).toBe(0);
    for (let i = 32; i < 62; i++) expect(plain[i]).toBe(0);
  });

  it('throws on wrong scheme', () => {
    const bad = new Uint8Array([0x00, 0x14, 0x00, 0x0b, 0x00, 0x20]); // 0x0014 != ECDSA
    expect(() => parseTpmtSignature(bad)).toThrow('unexpected scheme');
  });

  it('throws on truncated input', () => {
    expect(() => parseTpmtSignature(new Uint8Array(3))).toThrow();
  });

  it('throws when r or s exceed 32 bytes', () => {
    const r = new Uint8Array(33); // too big for P-256
    const s = new Uint8Array(32);
    const tpmt = new Uint8Array(4 + 2 + 33 + 2 + 32);
    tpmt[0] = 0x00;
    tpmt[1] = 0x18;
    tpmt[2] = 0x00;
    tpmt[3] = 0x0b;
    tpmt[4] = 0x00;
    tpmt[5] = 0x21; // size_r = 33
    tpmt.set(r, 6);
    tpmt[39] = 0x00;
    tpmt[40] = 0x20; // size_s = 32
    tpmt.set(s, 41);
    expect(() => parseTpmtSignature(tpmt)).toThrow('exceeds 32 bytes');
  });
});
