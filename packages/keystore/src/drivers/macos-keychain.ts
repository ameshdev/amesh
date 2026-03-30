import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { p256 } from '@noble/curves/nist.js';
import type { KeyStore } from '../interface.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HELPER_PATH = join(__dirname, '../../swift/amesh-se-helper');

interface HelperResponse {
  success: boolean;
  publicKey?: string;
  signature?: string;
  backend?: string;
  error?: string;
}

async function callHelper(command: Record<string, unknown>): Promise<HelperResponse> {
  return new Promise((resolve, reject) => {
    const child = spawn(HELPER_PATH, [], { timeout: 10_000 });
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
 */
function derToRaw(der: Uint8Array): Uint8Array {
  // DER: 30 <seqlen> 02 <rlen> <r> 02 <slen> <s>
  let i = 2; // skip SEQUENCE tag (0x30) + length byte
  i++; // skip INTEGER tag (0x02) for r
  const rLen = der[i++];
  let r = der.subarray(i, i + rLen);
  i += rLen;
  i++; // skip INTEGER tag (0x02) for s
  const sLen = der[i++];
  let s = der.subarray(i, i + sLen);

  // Strip leading zero padding (DER uses signed integers)
  if (r[0] === 0 && r.length > 32) r = r.subarray(1);
  if (s[0] === 0 && s.length > 32) s = s.subarray(1);

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
