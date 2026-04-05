import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { randomBytes } from '@noble/ciphers/utils.js';
import { p256 } from '@noble/curves/nist.js';
import type { KeyStore } from '../interface.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the Swift helper binary path.
 *
 * Search order:
 *   1. Next to the running executable (Homebrew / compiled binary)
 *   2. In libexec/ next to the executable (Homebrew convention)
 *   3. Source tree relative path (development)
 */
async function resolveHelperPath(): Promise<string> {
  const execDir = dirname(process.execPath);
  const candidates = [
    join(execDir, 'amesh-se-helper'),
    join(execDir, '..', 'libexec', 'amesh-se-helper'),
    join(__dirname, '../../swift/amesh-se-helper'),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // not found, try next
    }
  }
  throw new Error('amesh-se-helper not found');
}

let _helperPath: string | undefined;

interface HelperResponse {
  success: boolean;
  publicKey?: string;
  signature?: string;
  backend?: string;
  error?: string;
}

async function callHelper(command: Record<string, unknown>): Promise<HelperResponse> {
  if (!_helperPath) _helperPath = await resolveHelperPath();
  return new Promise((resolve, reject) => {
    const child = spawn(_helperPath!, [], { timeout: 10_000 });
    const chunks: Buffer[] = [];

    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.on('error', reject);
    child.on('close', () => {
      const stdout = Buffer.concat(chunks).toString();
      try {
        const result = JSON.parse(stdout) as HelperResponse;
        if (!result.success) {
          reject(new Error(`amesh-se-helper: ${result.error}`));
        } else {
          resolve(result);
        }
      } catch {
        reject(new Error(`amesh-se-helper: invalid response: ${stdout}`));
      }
    });

    child.stdin.write(JSON.stringify(command));
    child.stdin.end();
  });
}

/**
 * Convert uncompressed SEC1 public key (65 bytes: 04||x||y) to compressed (33 bytes).
 */
function compressPublicKey(uncompressed: Uint8Array): Uint8Array {
  // p256.getPublicKey with compressed=true handles the conversion
  // But we need fromHex which takes a hex string in v2
  const hex = Buffer.from(uncompressed).toString('hex');
  const point = p256.Point.fromHex(hex);
  return point.toBytes(true);
}

/**
 * Convert DER-encoded ECDSA signature to raw r||s (64 bytes).
 * Also normalizes S to low-S (Apple produces high-S sometimes).
 *
 * L4 — hardened against malformed input. The helper is a locally-signed
 * binary so the trust boundary is internal, but the parser used to blindly
 * walk `der[i]` with no bounds checks, so a buggy or tampered helper could
 * write out-of-range bytes into the fixed 64-byte output. Every field read
 * now validates the index and the tag/length bytes.
 *
 * DER layout for an ECDSA signature:
 *   30 <seqlen> 02 <rlen> <r bytes> 02 <slen> <s bytes>
 * All lengths are short-form (one byte, < 128) because a P-256 signature
 * fits in < 72 bytes total. Long-form lengths are rejected as suspicious.
 */
export function derToRaw(der: Uint8Array): Uint8Array {
  const readByte = (idx: number): number => {
    if (idx >= der.length) throw new Error('derToRaw: truncated signature');
    return der[idx];
  };

  if (der.length < 8) throw new Error('derToRaw: signature too short');
  if (readByte(0) !== 0x30) throw new Error('derToRaw: expected SEQUENCE tag');

  const seqLen = readByte(1);
  if (seqLen & 0x80) throw new Error('derToRaw: long-form SEQUENCE length not expected for P-256');
  if (2 + seqLen > der.length) throw new Error('derToRaw: SEQUENCE length overflows buffer');

  let i = 2;
  if (readByte(i) !== 0x02) throw new Error('derToRaw: expected INTEGER tag for r');
  i++;
  const rLen = readByte(i);
  if (rLen & 0x80) throw new Error('derToRaw: long-form r length not expected');
  if (rLen === 0 || rLen > 33) throw new Error(`derToRaw: r length out of range (${rLen})`);
  i++;
  if (i + rLen > der.length) throw new Error('derToRaw: r overflows buffer');
  let r = der.subarray(i, i + rLen);
  i += rLen;

  if (readByte(i) !== 0x02) throw new Error('derToRaw: expected INTEGER tag for s');
  i++;
  const sLen = readByte(i);
  if (sLen & 0x80) throw new Error('derToRaw: long-form s length not expected');
  if (sLen === 0 || sLen > 33) throw new Error(`derToRaw: s length out of range (${sLen})`);
  i++;
  if (i + sLen > der.length) throw new Error('derToRaw: s overflows buffer');
  let s = der.subarray(i, i + sLen);

  // Strip leading zero padding (DER uses signed integers) — r/s of length 33
  // is legal when the high bit is set.
  if (r[0] === 0 && r.length > 32) r = r.subarray(1);
  if (s[0] === 0 && s.length > 32) s = s.subarray(1);
  if (r.length > 32 || s.length > 32) {
    throw new Error('derToRaw: r or s still > 32 bytes after strip');
  }

  // Normalize S to low-S (required by noble with lowS:true)
  const P256_N = BigInt('0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551');
  let sVal = BigInt('0x' + Buffer.from(s).toString('hex'));
  if (sVal > P256_N / 2n) {
    sVal = P256_N - sVal;
    s = new Uint8Array(Buffer.from(sVal.toString(16).padStart(64, '0'), 'hex'));
  }

  const raw = new Uint8Array(64);
  raw.set(r, 32 - r.length);
  raw.set(s, 64 - s.length);
  return raw;
}

/**
 * macOS Keychain keystore driver.
 * Uses a Swift helper binary that calls Security.framework.
 * Tries Secure Enclave first, falls back to software keychain.
 */
export class MacOSKeychainKeyStore implements KeyStore {
  private _backendName: string = 'keychain';
  private readonly keysDir: string;

  constructor(keysDir: string) {
    this.keysDir = keysDir;
  }

  get backendName(): string {
    return this._backendName;
  }

  async generateAndStore(deviceId: string): Promise<{ publicKey: Uint8Array }> {
    const result = await callHelper({ action: 'generate', deviceId });
    if (result.backend) this._backendName = result.backend;
    const uncompressed = new Uint8Array(Buffer.from(result.publicKey!, 'base64'));
    const compressed = compressPublicKey(uncompressed);
    return { publicKey: compressed };
  }

  async sign(deviceId: string, message: Uint8Array): Promise<Uint8Array> {
    // Send raw message — Swift uses ecdsaSignatureMessageX962SHA256 (hashes internally)
    const result = await callHelper({
      action: 'sign',
      deviceId,
      message: Buffer.from(message).toString('base64'),
    });
    // Helper returns DER-encoded signature, convert to raw r||s (64 bytes)
    const derSig = new Uint8Array(Buffer.from(result.signature!, 'base64'));
    return derToRaw(derSig);
  }

  async getPublicKey(deviceId: string): Promise<Uint8Array> {
    const result = await callHelper({ action: 'get-public-key', deviceId });
    const uncompressed = new Uint8Array(Buffer.from(result.publicKey!, 'base64'));
    return compressPublicKey(uncompressed);
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
    await callHelper({ action: 'delete', deviceId });
  }
}

/**
 * Check if the macOS keychain helper is available.
 */
export async function isMacOSKeychainAvailable(): Promise<{ available: boolean; backend: string }> {
  try {
    const result = await callHelper({ action: 'check' });
    return { available: true, backend: result.backend ?? 'keychain' };
  } catch {
    return { available: false, backend: 'none' };
  }
}
