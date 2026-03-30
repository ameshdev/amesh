import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createForBackend } from '../detect.js';
import { EncryptedFileKeyStore } from '../drivers/encrypted-file.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'amesh-detect-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('createForBackend', () => {
  it('creates EncryptedFileKeyStore for encrypted-file backend', async () => {
    const store = await createForBackend('encrypted-file', tempDir, 'pass');
    expect(store).toBeInstanceOf(EncryptedFileKeyStore);
    expect(store.backendName).toBe('encrypted-file');
  });

  it('throws if encrypted-file backend has no passphrase', async () => {
    await expect(createForBackend('encrypted-file', tempDir)).rejects.toThrow(/passphrase/);
  });

  it('throws for unknown backend', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(createForBackend('unknown' as any, tempDir)).rejects.toThrow(
      /Unknown storage backend/,
    );
  });
});
