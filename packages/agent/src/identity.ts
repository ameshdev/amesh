import { sha256 } from '@noble/hashes/sha2.js';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface Identity {
  version: '2.0.0';
  deviceId: string;
  keyAlias?: string; // internal key name in the keystore (may differ from deviceId for keychain/TPM)
  publicKey: string; // base64
  friendlyName: string;
  createdAt: string; // ISO 8601
  storageBackend: string;
  maxControllers?: number; // default 1 — max controllers allowed on this target
  /** SENSITIVE — auto-generated passphrase for encrypted-file backend. Never log or display. */
  passphrase?: string;
}

/**
 * Generate a device ID from a compressed P-256 public key.
 * deviceId = "am_" + Base64URL(SHA-256(compressedPublicKey)).slice(0, 16)
 */
export function generateDeviceId(publicKey: Uint8Array): string {
  const hash = sha256(publicKey);
  const b64url = Buffer.from(hash).toString('base64url');
  return `am_${b64url.slice(0, 16)}`;
}

export async function loadIdentity(path: string): Promise<Identity> {
  const content = await readFile(path, 'utf-8');
  return JSON.parse(content) as Identity;
}

export async function saveIdentity(path: string, identity: Identity): Promise<void> {
  const tmpPath = `${path}.tmp`;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(tmpPath, JSON.stringify(identity, null, 2), { encoding: 'utf-8', mode: 0o600 });
  await rename(tmpPath, path);
}

export async function identityExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}
