import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolvePassphrase,
  savePassphrase,
  deletePassphraseFile,
  getPassphrasePath,
  getAuthMeshDir,
} from '../paths.js';

/**
 * Regression tests for H2 — encrypted-file passphrase stored separately from
 * identity.json.
 *
 * These tests set AUTH_MESH_DIR to a temp directory so they don't collide
 * with a real amesh install.
 */
describe('passphrase location (H2)', () => {
  let tempDir: string;
  let prevAuthMeshDir: string | undefined;
  let prevEnvPass: string | undefined;
  let prevPassFile: string | undefined;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'amesh-h2-'));
    prevAuthMeshDir = process.env.AUTH_MESH_DIR;
    prevEnvPass = process.env.AUTH_MESH_PASSPHRASE;
    prevPassFile = process.env.AMESH_PASSPHRASE_FILE;
    process.env.AUTH_MESH_DIR = tempDir;
    delete process.env.AUTH_MESH_PASSPHRASE;
    delete process.env.AMESH_PASSPHRASE_FILE;
    await mkdir(tempDir, { recursive: true, mode: 0o700 });
  });

  afterEach(async () => {
    if (prevAuthMeshDir === undefined) delete process.env.AUTH_MESH_DIR;
    else process.env.AUTH_MESH_DIR = prevAuthMeshDir;
    if (prevEnvPass === undefined) delete process.env.AUTH_MESH_PASSPHRASE;
    else process.env.AUTH_MESH_PASSPHRASE = prevEnvPass;
    if (prevPassFile === undefined) delete process.env.AMESH_PASSPHRASE_FILE;
    else process.env.AMESH_PASSPHRASE_FILE = prevPassFile;
    await rm(tempDir, { recursive: true, force: true });
  });

  it('getAuthMeshDir honours AUTH_MESH_DIR env var', () => {
    expect(getAuthMeshDir()).toBe(tempDir);
  });

  it('savePassphrase writes to the dedicated file with mode 0o400', async () => {
    await savePassphrase('my-secret-passphrase-xxx');
    const path = getPassphrasePath();
    const content = await readFile(path, 'utf-8');
    expect(content.trim()).toBe('my-secret-passphrase-xxx');
    const s = await stat(path);
    // mode is stored in the low 9 bits
    expect(s.mode & 0o777).toBe(0o400);
  });

  it('resolvePassphrase returns undefined when no source is available', async () => {
    const result = await resolvePassphrase({});
    expect(result.passphrase).toBeUndefined();
    expect(result.migratedFromIdentity).toBe(false);
  });

  it('resolvePassphrase reads from AUTH_MESH_PASSPHRASE env var first', async () => {
    process.env.AUTH_MESH_PASSPHRASE = 'env-pass';
    await savePassphrase('file-pass'); // should be ignored
    const result = await resolvePassphrase({ passphrase: 'legacy-pass' });
    expect(result.passphrase).toBe('env-pass');
    expect(result.migratedFromIdentity).toBe(false);
  });

  it('resolvePassphrase reads from dedicated file when env var is absent', async () => {
    await savePassphrase('file-pass');
    const result = await resolvePassphrase({});
    expect(result.passphrase).toBe('file-pass');
    expect(result.migratedFromIdentity).toBe(false);
  });

  it('resolvePassphrase migrates legacy identity.passphrase to the dedicated file', async () => {
    const identity = { passphrase: 'legacy-from-identity-json' };
    const result = await resolvePassphrase(identity);
    expect(result.passphrase).toBe('legacy-from-identity-json');
    expect(result.migratedFromIdentity).toBe(true);
    // After migration, the field must be stripped from the identity object
    expect(identity.passphrase).toBeUndefined();
    // And the dedicated file must now contain the migrated value
    const fileContent = await readFile(getPassphrasePath(), 'utf-8');
    expect(fileContent.trim()).toBe('legacy-from-identity-json');
  });

  it('deletePassphraseFile is idempotent', async () => {
    // No error if the file doesn't exist
    await deletePassphraseFile();
    // Creates, then deletes
    await savePassphrase('temp');
    await deletePassphraseFile();
    // Reading after delete must fall back to undefined
    const result = await resolvePassphrase({});
    expect(result.passphrase).toBeUndefined();
  });

  it('getPassphrasePath honours AMESH_PASSPHRASE_FILE override', () => {
    const customPath = join(tempDir, 'custom-location', 'secret');
    process.env.AMESH_PASSPHRASE_FILE = customPath;
    expect(getPassphrasePath()).toBe(customPath);
  });

  it('identity.json and passphrase file are distinct paths', async () => {
    const identityPath = join(tempDir, 'identity.json');
    await writeFile(identityPath, '{}', { mode: 0o600 });
    await savePassphrase('secret');
    const passPath = getPassphrasePath();
    expect(passPath).not.toBe(identityPath);
    // And identity.json must not contain the passphrase after H2 fix
    const identityContent = await readFile(identityPath, 'utf-8');
    expect(identityContent).not.toContain('secret');
  });
});
