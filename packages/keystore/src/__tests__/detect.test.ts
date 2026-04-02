import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createForBackend } from '../detect.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'amesh-detect-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('createForBackend', () => {
  it('throws for unsupported backend', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(createForBackend('unknown' as any, tempDir)).rejects.toThrow(
      /Unsupported storage backend/,
    );
  });

  it('creates encrypted-file backend with passphrase', async () => {
    const keyStore = await createForBackend('encrypted-file', tempDir, 'test-passphrase');
    expect(keyStore.backendName).toBe('encrypted-file');
  });

  it('throws for encrypted-file backend without passphrase', async () => {
    await expect(createForBackend('encrypted-file', tempDir)).rejects.toThrow(
      /requires a passphrase/,
    );
  });
});
