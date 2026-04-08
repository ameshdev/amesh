import { Command, Flags } from '@oclif/core';
import {
  createForBackend,
  detectAndCreate,
  BACKEND_LABELS,
  generatePassphrase,
} from '@authmesh/keystore';
import type { StorageBackend } from '@authmesh/keystore';
import { generateDeviceId, saveIdentity, identityExists } from '../identity.js';
import {
  getIdentityPath,
  getKeysDir,
  getPassphrasePath,
  savePassphrase,
  deletePassphraseFile,
} from '../paths.js';
import { rename } from 'node:fs/promises';
import { join } from 'node:path';

const deviceIdPlaceholder = 'am_init';

export default class Init extends Command {
  static override description = 'Create a cryptographic identity for this device';

  static override flags = {
    name: Flags.string({
      char: 'n',
      description: 'Friendly name for this device',
      required: true,
    }),
    backend: Flags.string({
      char: 'b',
      description: 'Force a specific storage backend',
      options: ['secure-enclave', 'keychain', 'tpm2', 'encrypted-file'],
    }),
    force: Flags.boolean({
      description: 'Overwrite existing identity',
      default: false,
    }),
    'max-controllers': Flags.integer({
      description: 'Maximum number of controllers allowed (default: 1)',
      default: 1,
      min: 1,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Init);

    const identityPath = getIdentityPath();
    if (!flags.force && (await identityExists(identityPath))) {
      this.error('Identity already exists. Use --force to overwrite.');
    }

    this.log('');
    this.log('Generating P-256 keypair...');

    const keysDir = getKeysDir();
    let backend: StorageBackend;
    let keyStore;
    let resolvedPassphrase: string | undefined;
    let warning: string | undefined;

    if (flags.backend) {
      backend = flags.backend as StorageBackend;
      if (backend === 'encrypted-file') {
        // Prefer operator-supplied passphrase via env var so secrets never
        // have to touch disk. Only auto-generate as a last resort.
        resolvedPassphrase = process.env.AUTH_MESH_PASSPHRASE ?? generatePassphrase();
        warning =
          'Using encrypted-file backend — keys are SOFTWARE-PROTECTED only.\n' +
          '  Private key is encrypted on disk but not bound to hardware.\n' +
          `  Passphrase is stored in ${getPassphrasePath()} with mode 0o400.\n` +
          '  For true hardware-level protection move this file to a secrets\n' +
          '  manager / tmpfs / separate mount, or set AUTH_MESH_PASSPHRASE on\n' +
          '  each run instead (see AMESH_PASSPHRASE_FILE).\n' +
          '  For hardware-backed storage, use macOS (Keychain) or Linux with\n' +
          '  TPM 2.0, then re-run `amesh init --force`.';
      }
      keyStore = await createForBackend(backend, keysDir, resolvedPassphrase);
      this.log(`  Using backend: ${BACKEND_LABELS[backend]}`);
    } else {
      this.log('');
      this.log('Detecting key storage backend:');
      const result = await detectAndCreate(keysDir, (msg) => this.log(msg));
      backend = result.backend;
      keyStore = result.keyStore;
      resolvedPassphrase = result.passphrase;
      warning = result.warning;
    }

    // Generate key and derive device ID from public key
    const { publicKey } = await keyStore.generateAndStore(deviceIdPlaceholder);
    const deviceId = generateDeviceId(publicKey);

    let keyAlias: string;

    if (backend === 'encrypted-file') {
      // Encrypted-file driver stores keys as files — rename to real device ID
      const oldPath = join(keysDir, `${deviceIdPlaceholder}.key.json`);
      const newPath = join(keysDir, `${deviceId}.key.json`);
      await rename(oldPath, newPath);
      keyAlias = deviceId;
    } else {
      // Hardware keystores can't rename keys — key stays stored under deviceIdPlaceholder.
      // context.ts maps deviceId → internal key name via identity.keyAlias.
      keyAlias = deviceIdPlaceholder;
    }

    const identity = {
      version: '2.0.0' as const,
      deviceId,
      keyAlias,
      publicKey: Buffer.from(publicKey).toString('base64'),
      friendlyName: flags.name,
      createdAt: new Date().toISOString(),
      storageBackend: backend,
      ...(flags['max-controllers'] > 1 ? { maxControllers: flags['max-controllers'] } : {}),
    };

    await saveIdentity(identityPath, identity);

    // H2 — write the passphrase (if any) to its dedicated file, NOT
    // identity.json. This way a leak of identity.json alone does not
    // compromise the encrypted-file backend's key. On `--force`, clear any
    // pre-existing passphrase file so a backend switch doesn't leave stale
    // state behind.
    await deletePassphraseFile();
    if (resolvedPassphrase) {
      await savePassphrase(resolvedPassphrase);
    }

    // Remove stale allow list — it was sealed with the old key and can't be verified
    const { getAllowListPath } = await import('../paths.js');
    const { unlink } = await import('node:fs/promises');
    await unlink(getAllowListPath()).catch(() => {});

    this.log('');
    this.log('Identity created.');
    this.log('');
    this.log(`  Device ID     : ${deviceId}`);
    this.log(`  Public Key    : ${identity.publicKey.slice(0, 20)}...`);
    this.log(`  Backend       : ${BACKEND_LABELS[backend]}`);
    this.log(`  Friendly Name : ${flags.name}`);

    if (warning) {
      this.log('');
      this.warn(warning);
    }

    this.log('');
    this.log('Next steps:');
    this.log('  This is the server:  run `amesh listen`, then `amesh invite <code>` from your laptop');
    this.log('  This is your laptop: run `amesh listen` on the server first, then `amesh invite <code>` here');
    this.log('  Remote / scripted:   run `amesh provision` on the controller for non-interactive pairing');
  }
}
