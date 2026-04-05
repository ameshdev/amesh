import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { readFile, writeFile, mkdir, chmod, unlink, rename } from 'node:fs/promises';

const AUTH_MESH_DIR = join(homedir(), '.amesh');

export function getAuthMeshDir(): string {
  return process.env.AUTH_MESH_DIR ?? AUTH_MESH_DIR;
}

export function getIdentityPath(): string {
  return join(getAuthMeshDir(), 'identity.json');
}

export function getAllowListPath(): string {
  return join(getAuthMeshDir(), 'allow_list.json');
}

export function getKeysDir(): string {
  return join(getAuthMeshDir(), 'keys');
}

/**
 * Location of the encrypted-file backend passphrase, stored separately from
 * identity.json so a leak of identity.json alone does not compromise the key.
 *
 * Prior to the H2 fix the passphrase was written into identity.json next to
 * the encrypted key file, which gave the "encrypted-file" backend no real
 * protection against filesystem-level attackers — any read of one implied a
 * read of the other. Operators can relocate this file outside the amesh dir
 * (different mount, secrets manager tmpfs, etc.) via AMESH_PASSPHRASE_FILE.
 */
export function getPassphrasePath(): string {
  return process.env.AMESH_PASSPHRASE_FILE ?? join(getAuthMeshDir(), '.passphrase');
}

/**
 * Write the encrypted-file backend passphrase to its dedicated file with
 * restrictive permissions (0o400 — read-only owner). Uses an atomic
 * tmp+rename so a crash mid-write cannot leave a half-written file.
 */
export async function savePassphrase(passphrase: string): Promise<void> {
  const path = getPassphrasePath();
  const tmpPath = `${path}.tmp`;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(tmpPath, passphrase, { encoding: 'utf-8', mode: 0o600 });
  await rename(tmpPath, path);
  // Tighten to read-only owner after rename so a subsequent overwrite still
  // requires an explicit unlink+rename cycle (avoids accidental append).
  await chmod(path, 0o400);
}

/**
 * Read the passphrase from (in priority order):
 *   1. AUTH_MESH_PASSPHRASE env var (operator-supplied, never touches disk)
 *   2. The dedicated passphrase file (getPassphrasePath)
 *   3. The legacy `identity.passphrase` field (pre-H2, auto-migrated)
 *
 * When (3) is used, the passphrase is automatically migrated to (2) and the
 * field is cleared from the returned identity object. Callers are responsible
 * for re-saving the identity to persist the migration.
 *
 * Returns undefined if no passphrase is available from any source.
 */
export async function resolvePassphrase(
  identity: { passphrase?: string } = {},
): Promise<{ passphrase: string | undefined; migratedFromIdentity: boolean }> {
  const envPass = process.env.AUTH_MESH_PASSPHRASE;
  if (envPass) return { passphrase: envPass, migratedFromIdentity: false };

  try {
    const fileContent = await readFile(getPassphrasePath(), 'utf-8');
    return { passphrase: fileContent.trim(), migratedFromIdentity: false };
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  // Legacy fallback: identity.passphrase (pre-H2)
  if (identity.passphrase) {
    await savePassphrase(identity.passphrase);
    const migrated = identity.passphrase;
    delete identity.passphrase;
    // eslint-disable-next-line no-console
    console.warn(
      '[amesh] migrated legacy passphrase from identity.json to dedicated file. ' +
        'The identity.json file should be re-saved to clear the deprecated field.',
    );
    return { passphrase: migrated, migratedFromIdentity: true };
  }

  return { passphrase: undefined, migratedFromIdentity: false };
}

/**
 * Delete the passphrase file, if present. Used by `amesh init --force` so a
 * backend change (e.g. encrypted-file → keychain) doesn't leave stale state.
 */
export async function deletePassphraseFile(): Promise<void> {
  try {
    await unlink(getPassphrasePath());
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}
