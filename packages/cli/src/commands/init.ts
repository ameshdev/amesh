import { Command, Flags } from '@oclif/core';
import { createForBackend, detectAndCreate } from '@authmesh/keystore';
import type { StorageBackend } from '@authmesh/keystore';
import { generateDeviceId, saveIdentity, identityExists } from '../identity.js';
import { getIdentityPath, getKeysDir } from '../paths.js';
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
    passphrase: Flags.string({
      char: 'p',
      description: 'Passphrase for encrypted-file backend (or set AUTH_MESH_PASSPHRASE)',
      env: 'AUTH_MESH_PASSPHRASE',
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

    // Validate passphrase requirement for encrypted-file backend
    if (flags.backend === 'encrypted-file' && !flags.passphrase) {
      this.error(
        'Encrypted-file backend requires a passphrase.\n' +
          '  Use --passphrase <passphrase> or set AUTH_MESH_PASSPHRASE.',
      );
    }

    this.log('');
    this.log('Generating P-256 keypair...');

    const keysDir = getKeysDir();
    let backend: StorageBackend;
    let keyStore;

    if (flags.backend) {
      backend = flags.backend as StorageBackend;
      keyStore = await createForBackend(backend, keysDir, flags.passphrase);
    } else {
      const result = await detectAndCreate(keysDir, flags.passphrase);
      backend = result.backend;
      keyStore = result.keyStore;
      if (result.warning) {
        this.warn(result.warning);
      }
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

    // Remove stale allow list — it was sealed with the old key and can't be verified
    const { getAllowListPath } = await import('../paths.js');
    const { unlink } = await import('node:fs/promises');
    await unlink(getAllowListPath()).catch(() => {});

    this.log('Identity created.');
    this.log('');
    this.log(`  Device ID : ${deviceId}`);
    this.log(`  Public Key: ${identity.publicKey.slice(0, 20)}...`);
    this.log(`  Backend   : ${backend}`);
    if (backend === 'encrypted-file') {
      this.log('');
      this.warn(
        'Using file-based key storage. Keys are protected by filesystem permissions and a passphrase, not hardware.\n' +
          '  For hardware-backed storage, use macOS or a Linux host with TPM 2.0.',
      );
    }
    this.log('');
    this.log('Run `amesh listen` on this machine, then `amesh invite` from your laptop.');
  }
}
