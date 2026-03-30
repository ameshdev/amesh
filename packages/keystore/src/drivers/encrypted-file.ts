import { p256 } from '@noble/curves/nist.js';
import { argon2id } from '@noble/hashes/argon2.js';
import { gcm } from '@noble/ciphers/aes.js';
import { randomBytes } from '@noble/ciphers/utils.js';
import { deriveKey } from '@authmesh/core';
import type { KeyStore } from '../interface.js';
import { readFile, writeFile, mkdir, unlink, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const ARGON2_PARAMS = { t: 3, m: 65536, p: 1 } as const; // 64MB, 3 iterations
const SALT_LEN = 16;
const NONCE_LEN = 12; // AES-GCM standard
const KEY_LEN = 32; // AES-256

interface EncryptedKeyFile {
  version: '2.0.0';
  algorithm: 'aes-256-gcm';
  kdf: 'argon2id';
  argon2Params: { t: number; m: number; p: number };
  salt: string; // base64
  nonce: string; // base64
  ciphertext: string; // base64 (encrypted private key)
  publicKey: string; // base64 (compressed P-256, unencrypted)
}

const DEVICE_ID_RE = /^[a-zA-Z0-9_-]+$/;

function validateDeviceId(deviceId: string): void {
  if (!DEVICE_ID_RE.test(deviceId)) {
    throw new Error(`Invalid device ID: must match ${DEVICE_ID_RE}`);
  }
}

function getKeyPath(basePath: string, deviceId: string): string {
  validateDeviceId(deviceId);
  return join(basePath, `${deviceId}.key.json`);
}

function deriveEncryptionKey(passphrase: string, salt: Uint8Array): Uint8Array {
  const passphraseBytes = new TextEncoder().encode(passphrase);
  return argon2id(passphraseBytes, salt, {
    t: ARGON2_PARAMS.t,
    m: ARGON2_PARAMS.m,
    p: ARGON2_PARAMS.p,
    dkLen: KEY_LEN,
  });
}

/**
 * Encrypted file keystore driver (Tier 4 — last resort fallback).
 *
 * Private key is encrypted at rest with AES-256-GCM, using a key derived
 * from a user-supplied passphrase via Argon2id. The private key exists in
 * memory only during sign() calls.
 */
export class EncryptedFileKeyStore implements KeyStore {
  readonly backendName = 'encrypted-file';
  private readonly basePath: string;
  private readonly passphrase: string;

  constructor(basePath: string, passphrase: string) {
    this.basePath = basePath;
    this.passphrase = passphrase;
  }

  async generateAndStore(deviceId: string): Promise<{ publicKey: Uint8Array }> {
    const privateKey = p256.utils.randomSecretKey();
    const publicKey = p256.getPublicKey(privateKey, true);

    const salt = randomBytes(SALT_LEN);
    const nonce = randomBytes(NONCE_LEN);
    const encKey = deriveEncryptionKey(this.passphrase, salt);

    const cipher = gcm(encKey, nonce);
    const ciphertext = cipher.encrypt(privateKey);

    const keyFile: EncryptedKeyFile = {
      version: '2.0.0',
      algorithm: 'aes-256-gcm',
      kdf: 'argon2id',
      argon2Params: { ...ARGON2_PARAMS },
      salt: Buffer.from(salt).toString('base64'),
      nonce: Buffer.from(nonce).toString('base64'),
      ciphertext: Buffer.from(ciphertext).toString('base64'),
      publicKey: Buffer.from(publicKey).toString('base64'),
    };

    await this.writeAtomic(deviceId, keyFile);
    return { publicKey };
  }

  async sign(deviceId: string, message: Uint8Array): Promise<Uint8Array> {
    const privateKey = await this.loadPrivateKey(deviceId);
    try {
      // p256.sign() hashes internally with SHA-256 — do NOT pre-hash
      return p256.sign(message, privateKey, { lowS: true });
    } finally {
      // Zero out private key from memory
      privateKey.fill(0);
    }
  }

  async getPublicKey(deviceId: string): Promise<Uint8Array> {
    const keyFile = await this.readKeyFile(deviceId);
    return new Uint8Array(Buffer.from(keyFile.publicKey, 'base64'));
  }

  async getHmacKeyMaterial(deviceId: string): Promise<Uint8Array> {
    const privateKey = await this.loadPrivateKey(deviceId);
    try {
      return deriveKey(privateKey, 'amesh-hmac-material-v1', deviceId, 32);
    } finally {
      privateKey.fill(0);
    }
  }

  async delete(deviceId: string): Promise<void> {
    const path = getKeyPath(this.basePath, deviceId);
    await unlink(path);
  }

  private async loadPrivateKey(deviceId: string): Promise<Uint8Array> {
    const keyFile = await this.readKeyFile(deviceId);
    const salt = Buffer.from(keyFile.salt, 'base64');
    const nonce = Buffer.from(keyFile.nonce, 'base64');
    const ciphertext = Buffer.from(keyFile.ciphertext, 'base64');

    const encKey = deriveEncryptionKey(this.passphrase, salt);
    const cipher = gcm(encKey, nonce);

    try {
      return cipher.decrypt(ciphertext);
    } catch {
      throw new Error('Decryption failed — wrong passphrase or corrupted key file');
    }
  }

  private async readKeyFile(deviceId: string): Promise<EncryptedKeyFile> {
    const path = getKeyPath(this.basePath, deviceId);
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content) as EncryptedKeyFile;
  }

  private async writeAtomic(deviceId: string, keyFile: EncryptedKeyFile): Promise<void> {
    const path = getKeyPath(this.basePath, deviceId);
    const tmpPath = `${path}.tmp`;

    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(tmpPath, JSON.stringify(keyFile, null, 2), { encoding: 'utf-8', mode: 0o600 });
    await rename(tmpPath, path);
  }
}
