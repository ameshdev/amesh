import { describe, it, expect, beforeEach, afterEach, setDefaultTimeout } from 'bun:test';

setDefaultTimeout(30_000);
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { verifyMessage } from '@authmesh/core';
import { EncryptedFileKeyStore } from '../drivers/encrypted-file.js';

let tempDir: string;
const PASSPHRASE = 'test-passphrase-for-testing';
const DEVICE_ID = 'am_test1234abcd';

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'amesh-test-'));
});

afterEach(async () => {
  // Small delay to let pending I/O from atomic writes settle before cleanup
  await new Promise((r) => setTimeout(r, 50));
  await rm(tempDir, { recursive: true, force: true }).catch(() => {});
});

describe('EncryptedFileKeyStore', () => {
  it('has correct backend name', () => {
    const store = new EncryptedFileKeyStore(tempDir, PASSPHRASE);
    expect(store.backendName).toBe('encrypted-file');
  });

  describe('generateAndStore', () => {
    it('returns 33-byte compressed P-256 public key', async () => {
      const store = new EncryptedFileKeyStore(tempDir, PASSPHRASE);
      const { publicKey } = await store.generateAndStore(DEVICE_ID);

      expect(publicKey).toBeInstanceOf(Uint8Array);
      expect(publicKey.length).toBe(33);
      expect([0x02, 0x03]).toContain(publicKey[0]);
    });

    it('writes encrypted key file to disk', async () => {
      const store = new EncryptedFileKeyStore(tempDir, PASSPHRASE);
      await store.generateAndStore(DEVICE_ID);

      const filePath = join(tempDir, `${DEVICE_ID}.key.json`);
      const content = JSON.parse(await readFile(filePath, 'utf-8'));

      expect(content.version).toBe('2.0.0');
      expect(content.algorithm).toBe('aes-256-gcm');
      expect(content.kdf).toBe('argon2id');
      expect(content.salt).toBeTruthy();
      expect(content.nonce).toBeTruthy();
      expect(content.ciphertext).toBeTruthy();
      expect(content.publicKey).toBeTruthy();
    });

    it('ciphertext differs from raw private key', async () => {
      const store = new EncryptedFileKeyStore(tempDir, PASSPHRASE);
      await store.generateAndStore(DEVICE_ID);

      const filePath = join(tempDir, `${DEVICE_ID}.key.json`);
      const content = JSON.parse(await readFile(filePath, 'utf-8'));
      const ciphertext = Buffer.from(content.ciphertext, 'base64');

      // Ciphertext should be longer than 32 bytes (private key + GCM tag)
      expect(ciphertext.length).toBeGreaterThan(32);
    });
  });

  describe('getPublicKey', () => {
    it('returns the same public key that was generated', async () => {
      const store = new EncryptedFileKeyStore(tempDir, PASSPHRASE);
      const { publicKey: generated } = await store.generateAndStore(DEVICE_ID);
      const retrieved = await store.getPublicKey(DEVICE_ID);

      expect(retrieved).toEqual(generated);
    });
  });

  describe('sign', () => {
    it('returns 64-byte signature', async () => {
      const store = new EncryptedFileKeyStore(tempDir, PASSPHRASE);
      await store.generateAndStore(DEVICE_ID);

      const message = new TextEncoder().encode('test message');
      const sig = await store.sign(DEVICE_ID, message);

      expect(sig).toBeInstanceOf(Uint8Array);
      expect(sig.length).toBe(64);
    });

    it('produces verifiable signature', async () => {
      const store = new EncryptedFileKeyStore(tempDir, PASSPHRASE);
      const { publicKey } = await store.generateAndStore(DEVICE_ID);

      const message = new TextEncoder().encode('test message');
      const sig = await store.sign(DEVICE_ID, message);

      expect(verifyMessage(sig, message, publicKey)).toBe(true);
    });

    it('signature fails verification with wrong message', async () => {
      const store = new EncryptedFileKeyStore(tempDir, PASSPHRASE);
      const { publicKey } = await store.generateAndStore(DEVICE_ID);

      const sig = await store.sign(DEVICE_ID, new TextEncoder().encode('correct'));

      expect(verifyMessage(sig, new TextEncoder().encode('tampered'), publicKey)).toBe(false);
    });
  });

  describe('wrong passphrase', () => {
    it('fails to sign with wrong passphrase', async () => {
      const store = new EncryptedFileKeyStore(tempDir, PASSPHRASE);
      await store.generateAndStore(DEVICE_ID);

      const wrongStore = new EncryptedFileKeyStore(tempDir, 'wrong-passphrase');
      await expect(
        wrongStore.sign(DEVICE_ID, new TextEncoder().encode('test')),
      ).rejects.toThrow(/[Dd]ecryption failed/);
    });
  });

  describe('delete', () => {
    it('removes key file from disk', async () => {
      const store = new EncryptedFileKeyStore(tempDir, PASSPHRASE);
      await store.generateAndStore(DEVICE_ID);
      await store.delete(DEVICE_ID);

      await expect(store.getPublicKey(DEVICE_ID)).rejects.toThrow();
    });
  });

  describe('full round-trip', () => {
    it('generate → sign → verify → delete', async () => {
      const store = new EncryptedFileKeyStore(tempDir, PASSPHRASE);
      const { publicKey } = await store.generateAndStore(DEVICE_ID);

      const msg = new TextEncoder().encode('amesh wire protocol message');
      const sig = await store.sign(DEVICE_ID, msg);
      expect(verifyMessage(sig, msg, publicKey)).toBe(true);

      await store.delete(DEVICE_ID);
      await expect(store.sign(DEVICE_ID, msg)).rejects.toThrow();
    });
  });

  describe('multiple devices', () => {
    it('stores and retrieves keys for different devices', async () => {
      const store = new EncryptedFileKeyStore(tempDir, PASSPHRASE);
      const { publicKey: pk1 } = await store.generateAndStore('am_device1');
      const { publicKey: pk2 } = await store.generateAndStore('am_device2');

      expect(pk1).not.toEqual(pk2);
      expect(await store.getPublicKey('am_device1')).toEqual(pk1);
      expect(await store.getPublicKey('am_device2')).toEqual(pk2);
    });
  });

  describe('adversarial: tampered key file', () => {
    it('fails to decrypt if ciphertext is modified', async () => {
      const store = new EncryptedFileKeyStore(tempDir, PASSPHRASE);
      await store.generateAndStore(DEVICE_ID);

      // Tamper with the ciphertext
      const filePath = join(tempDir, `${DEVICE_ID}.key.json`);
      const content = JSON.parse(await readFile(filePath, 'utf-8'));
      const ct = Buffer.from(content.ciphertext, 'base64');
      ct[0] ^= 0xff;
      content.ciphertext = ct.toString('base64');
      await writeFile(filePath, JSON.stringify(content));

      await expect(
        store.sign(DEVICE_ID, new TextEncoder().encode('test')),
      ).rejects.toThrow(/[Dd]ecryption failed/);
    });
  });
});
