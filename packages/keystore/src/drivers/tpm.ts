import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from '@noble/ciphers/utils.js';
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
      await tpm2('sign', ['-c', handle, '-g', 'sha256', '-s', 'ecdsa', '-o', sigPath, msgPath]);
      return new Uint8Array(await readFile(sigPath));
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

function pemToRaw(pem: string): Uint8Array {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  return new Uint8Array(Buffer.from(b64, 'base64'));
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
