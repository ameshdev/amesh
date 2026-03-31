import { Command, Flags } from '@oclif/core';
import { createForBackend, detectAndCreate } from '@authmesh/keystore';
import type { StorageBackend } from '@authmesh/keystore';
import { generateDeviceId, saveIdentity, identityExists } from '../identity.js';
import { getIdentityPath, getKeysDir } from '../paths.js';

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
      options: ['secure-enclave', 'keychain', 'tpm2'],
    }),
    force: Flags.boolean({
      description: 'Overwrite existing identity',
      default: false,
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

    if (flags.backend) {
      backend = flags.backend as StorageBackend;
      keyStore = await createForBackend(backend, keysDir);
    } else {
      const result = await detectAndCreate(keysDir);
      backend = result.backend;
      keyStore = result.keyStore;
      if (result.warning) {
        this.warn(result.warning);
      }
    }

    // Generate key and derive device ID from public key
    const { publicKey } = await keyStore.generateAndStore(deviceIdPlaceholder);
    const deviceId = generateDeviceId(publicKey);

    // Hardware keystores can't rename keys — key stays stored under deviceIdPlaceholder.
    // context.ts maps deviceId → internal key name via identity.keyAlias.
    const keyAlias = deviceIdPlaceholder;

    const identity = {
      version: '2.0.0' as const,
      deviceId,
      keyAlias,
      publicKey: Buffer.from(publicKey).toString('base64'),
      friendlyName: flags.name,
      createdAt: new Date().toISOString(),
      storageBackend: backend,
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
    this.log('');
    this.log('Run `amesh listen` on this machine, then `amesh invite` from your laptop.');
  }
}
