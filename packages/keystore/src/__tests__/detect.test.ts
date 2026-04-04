import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createForBackend, detectAndCreate } from '../detect.js';

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

describe('detectAndCreate', () => {
  it('auto-generates passphrase for encrypted-file fallback', async () => {
    const result = await detectAndCreate(tempDir);
    expect(result.backend).toBeDefined();
    expect(result.keyStore).toBeDefined();
    if (result.backend === 'encrypted-file') {
      expect(result.passphrase).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('calls onProgress callback', async () => {
    const messages: string[] = [];
    await detectAndCreate(tempDir, (msg) => messages.push(msg));
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.some((m) => m.includes('selected'))).toBe(true);
  });
});
