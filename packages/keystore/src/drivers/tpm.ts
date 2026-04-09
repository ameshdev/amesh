import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from '@noble/ciphers/utils.js';
import { p256 } from '@noble/curves/nist.js';
import type { KeyStore } from '../interface.js';

const execFileAsync = promisify(execFile);

async function tpm2(subcommand: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(`tpm2_${subcommand}`, args, {
    timeout: 15_000,
  });
  return stdout;
}

function tmpPath(suffix: string): string {
  return join(tmpdir(), `amesh_${randomUUID()}_${suffix}`);
}

async function cleanup(paths: string[]): Promise<void> {
  await Promise.allSettled(paths.map((p) => unlink(p)));
}

/**
 * TPM 2.0 keystore driver.
 * Uses tpm2-tools subprocess via execFile for P-256 key operations.
 */
export class TPMKeyStore implements KeyStore {
  readonly backendName = 'tpm2';
  private readonly keysDir: string;

  constructor(keysDir: string) {
    this.keysDir = keysDir;
  }

  /**
   * Derive a deterministic persistent handle from device ID.
   * Persistent handles are in range 0x81000000 - 0x81FFFFFF.
   */
  private handleFor(deviceId: string): string {
    const hash = createHash('sha256').update(deviceId).digest();
    const offset = hash.readUInt32BE(0) & 0x00ffffff;
    return `0x81${offset.toString(16).padStart(6, '0')}`;
  }

  async generateAndStore(deviceId: string): Promise<{ publicKey: Uint8Array }> {
    const handle = this.handleFor(deviceId);
    const primaryCtx = tmpPath('primary.ctx');
    const keyPub = tmpPath('key.pub');
    const keyPriv = tmpPath('key.priv');
    const keyCtx = tmpPath('key.ctx');
    const keyPem = tmpPath('key.pem');

    try {
      await tpm2('createprimary', ['-C', 'o', '-g', 'sha256', '-G', 'ecc256', '-c', primaryCtx]);
      await tpm2('create', ['-C', primaryCtx, '-G', 'ecc256', '-u', keyPub, '-r', keyPriv]);
      await tpm2('load', ['-C', primaryCtx, '-u', keyPub, '-r', keyPriv, '-c', keyCtx]);
      await tpm2('evictcontrol', ['-C', 'o', '-c', keyCtx, handle]);
      await tpm2('readpublic', ['-c', handle, '-f', 'pem', '-o', keyPem]);

      const pem = await readFile(keyPem, 'utf8');
      return { publicKey: pemToRaw(pem) };
    } finally {
      await cleanup([primaryCtx, keyPub, keyPriv, keyCtx, keyPem]);
    }
  }

  async sign(deviceId: string, message: Uint8Array): Promise<Uint8Array> {
    const handle = this.handleFor(deviceId);
    const msgPath = tmpPath('msg');
    const sigPath = tmpPath('sig');

    try {
      await writeFile(msgPath, message, { mode: 0o600 });
      // M7 — tpm2_sign's default output is a TPMT_SIGNATURE structure, NOT
      // raw r||s, which is incompatible with @noble/curves' verifyMessage.
      // Request plain (r||s) format on tpm2-tools 5.x+. If the flag is
      // unsupported we fall back to parsing TPMT_SIGNATURE from the output.
      let wantedPlain = true;
      try {
        await tpm2('sign', [
          '-c',
          handle,
          '-g',
          'sha256',
          '-s',
          'ecdsa',
          '-f',
          'plain',
          '-o',
          sigPath,
          msgPath,
        ]);
      } catch {
        // Older tpm2-tools (4.x on Ubuntu 20.04) lack --format=plain. Retry
        // with default structured format and parse the TPMT_SIGNATURE below.
        wantedPlain = false;
        await tpm2('sign', ['-c', handle, '-g', 'sha256', '-s', 'ecdsa', '-o', sigPath, msgPath]);
      }
      const raw = new Uint8Array(await readFile(sigPath));
      return wantedPlain && raw.length === 64 ? raw : parseTpmtSignature(raw);
    } finally {
      await cleanup([msgPath, sigPath]);
    }
  }

  async getPublicKey(deviceId: string): Promise<Uint8Array> {
    const handle = this.handleFor(deviceId);
    const pemPath = tmpPath('pub.pem');

    try {
      await tpm2('readpublic', ['-c', handle, '-f', 'pem', '-o', pemPath]);
      const pem = await readFile(pemPath, 'utf8');
      return pemToRaw(pem);
    } finally {
      await cleanup([pemPath]);
    }
  }

  async getHmacKeyMaterial(deviceId: string): Promise<Uint8Array> {
    // Hardware keystores can't export private key material.
    // Use a stored random secret, generated once per device.
    const secretPath = join(this.keysDir, `${deviceId}.hmac`);
    try {
      return new Uint8Array(await readFile(secretPath));
    } catch {
      // First call or migration: generate and persist HMAC secret
      await mkdir(this.keysDir, { recursive: true, mode: 0o700 });
      const secret = randomBytes(32);
      await writeFile(secretPath, secret, { mode: 0o600 });
      return secret;
    }
  }

  async delete(deviceId: string): Promise<void> {
    const handle = this.handleFor(deviceId);
    await tpm2('evictcontrol', ['-C', 'o', '-c', handle]);
  }
}

/**
 * Decode a PEM-encoded P-256 SubjectPublicKeyInfo into a compressed (33-byte)
 * public key, matching the format the KeyStore interface expects.
 *
 * M7 — the previous implementation returned the full SPKI DER bytes (~91
 * bytes), not a 33-byte compressed point, so any caller that fed the result
 * into `p256.verify` or the canonical signing chain would fail.
 *
 * SPKI DER structure for a P-256 key (per RFC 5480):
 *
 *   SEQUENCE
 *     SEQUENCE (AlgorithmIdentifier)
 *       OID 1.2.840.10045.2.1  (ecPublicKey)
 *       OID 1.2.840.10045.3.1.7 (prime256v1)
 *     BIT STRING
 *       00                          -- unused bits = 0
 *       04 || X (32 bytes) || Y (32 bytes)  -- uncompressed SEC1 point
 *
 * We extract the 65-byte uncompressed point from the BIT STRING and compress
 * it via @noble/curves. Defensive bounds checks throughout so a malformed
 * PEM from a broken TPM cannot walk off the end of the buffer.
 */
export function pemToRaw(pem: string): Uint8Array {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const der = new Uint8Array(Buffer.from(b64, 'base64'));
  const uncompressed = extractSec1PointFromSpki(der);
  // @noble/curves Point.fromHex accepts the uncompressed SEC1 encoding and
  // round-trips to the compressed form.
  const hex = Buffer.from(uncompressed).toString('hex');
  return p256.Point.fromHex(hex).toBytes(true);
}

/**
 * Walk a P-256 SPKI DER and return the 65-byte uncompressed SEC1 point.
 * Not a general-purpose ASN.1 parser — only handles the exact structure
 * RFC 5480 defines for P-256 public keys. Throws on any mismatch.
 */
export function extractSec1PointFromSpki(der: Uint8Array): Uint8Array {
  if (der.length < 10) throw new Error('SPKI too short');
  if (der[0] !== 0x30) throw new Error('SPKI: outer SEQUENCE tag missing');

  // Parse outer SEQUENCE length (may be short or long form)
  let idx = 1;
  const outerLen = readDerLength(der, idx);
  idx = outerLen.nextOffset;
  if (idx + outerLen.length > der.length) throw new Error('SPKI: outer length overflow');

  // AlgorithmIdentifier SEQUENCE
  if (der[idx] !== 0x30) throw new Error('SPKI: AlgorithmIdentifier tag missing');
  idx++;
  const algLen = readDerLength(der, idx);
  idx = algLen.nextOffset + algLen.length; // skip past AlgorithmIdentifier entirely

  // BIT STRING
  if (idx >= der.length) throw new Error('SPKI: BIT STRING missing');
  if (der[idx] !== 0x03) throw new Error('SPKI: BIT STRING tag missing');
  idx++;
  const bitLen = readDerLength(der, idx);
  idx = bitLen.nextOffset;
  if (idx + bitLen.length > der.length) throw new Error('SPKI: BIT STRING length overflow');

  // First byte of a BIT STRING is the number of unused bits; must be 0
  // for a public key.
  const unusedBits = der[idx++];
  if (unusedBits !== 0x00) throw new Error('SPKI: unexpected unused-bits value');

  // Remaining bytes of the BIT STRING are the uncompressed SEC1 point.
  // For P-256 that's exactly 65 bytes: 0x04 || X (32) || Y (32).
  const point = der.subarray(idx, idx + (bitLen.length - 1));
  if (point.length !== 65) throw new Error(`SPKI: expected 65-byte point, got ${point.length}`);
  if (point[0] !== 0x04) throw new Error('SPKI: point is not uncompressed SEC1');
  return new Uint8Array(point);
}

/**
 * Read a DER length field at `offset` in `buf`. Returns the decoded length
 * and the offset of the first content byte. Handles short form (1 byte,
 * high bit clear) and long form (1 byte = 0x80 | n, followed by n length
 * bytes big-endian). Rejects lengths > 2^24 as a sanity check.
 */
function readDerLength(buf: Uint8Array, offset: number): { length: number; nextOffset: number } {
  if (offset >= buf.length) throw new Error('DER: length byte out of range');
  const first = buf[offset];
  if ((first & 0x80) === 0) {
    return { length: first, nextOffset: offset + 1 };
  }
  const numBytes = first & 0x7f;
  if (numBytes === 0 || numBytes > 3) {
    throw new Error(`DER: unsupported length encoding (${numBytes} bytes)`);
  }
  if (offset + 1 + numBytes > buf.length) {
    throw new Error('DER: long-form length truncated');
  }
  let length = 0;
  for (let i = 0; i < numBytes; i++) {
    length = (length << 8) | buf[offset + 1 + i];
  }
  return { length, nextOffset: offset + 1 + numBytes };
}

/**
 * Parse a TPMT_SIGNATURE structure (TPM 2.0 binary format) for an ECDSA
 * signature and return the raw r||s (64 bytes) form @noble/curves expects.
 *
 * Layout (big-endian fields):
 *   TPMI_ALG_SIG_SCHEME  (2 bytes)  — must be 0x0018 (TPM_ALG_ECDSA)
 *   TPMI_ALG_HASH        (2 bytes)  — hash alg; we don't enforce here
 *   TPMS_SIGNATURE_ECDSA {
 *     TPMT_ECC_SCHEME {
 *       UINT16 size_r
 *       BYTES  r
 *     }
 *     TPMT_ECC_SCHEME {
 *       UINT16 size_s
 *       BYTES  s
 *     }
 *   }
 *
 * Used only as a fallback when tpm2-tools < 5.x (no `--format=plain`
 * support) writes structured output.
 */
export function parseTpmtSignature(buf: Uint8Array): Uint8Array {
  if (buf.length < 2) throw new Error('TPMT_SIGNATURE: too short');
  const sigScheme = (buf[0] << 8) | buf[1];
  const TPM_ALG_ECDSA = 0x0018;
  if (sigScheme !== TPM_ALG_ECDSA) {
    throw new Error(`TPMT_SIGNATURE: unexpected scheme 0x${sigScheme.toString(16)}`);
  }
  // Skip hash alg (2 bytes)
  let idx = 4;
  if (buf.length < idx + 2) throw new Error('TPMT_SIGNATURE: truncated before r');
  const sizeR = (buf[idx] << 8) | buf[idx + 1];
  idx += 2;
  if (buf.length < idx + sizeR) throw new Error('TPMT_SIGNATURE: truncated r');
  const r = buf.subarray(idx, idx + sizeR);
  idx += sizeR;
  if (buf.length < idx + 2) throw new Error('TPMT_SIGNATURE: truncated before s');
  const sizeS = (buf[idx] << 8) | buf[idx + 1];
  idx += 2;
  if (buf.length < idx + sizeS) throw new Error('TPMT_SIGNATURE: truncated s');
  const s = buf.subarray(idx, idx + sizeS);

  // Pad to 32 bytes each (TPM may omit leading zeros)
  if (sizeR > 32 || sizeS > 32) {
    throw new Error('TPMT_SIGNATURE: r or s exceeds 32 bytes');
  }
  const raw = new Uint8Array(64);
  raw.set(r, 32 - sizeR);
  raw.set(s, 64 - sizeS);
  return raw;
}

/**
 * Check if TPM 2.0 is available.
 */
export async function isTPM2Available(): Promise<boolean> {
  if (process.platform !== 'linux') return false;
  try {
    await tpm2('getcap', ['properties-fixed']);
    return true;
  } catch {
    return false;
  }
}
