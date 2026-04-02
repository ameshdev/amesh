import { platform } from 'node:os';
import type { KeyStore } from './interface.js';

export type StorageBackend = 'secure-enclave' | 'keychain' | 'tpm2' | 'encrypted-file';

export interface DetectionResult {
  backend: StorageBackend;
  keyStore: KeyStore;
  warning?: string;
}

/**
 * Detect the best available keystore backend and create an instance.
 *
 * Detection chain:
 *   Tier 1: macOS Keychain (tries Secure Enclave first, falls back to software keychain)
 *   Tier 2: TPM 2.0 (Linux)
 *   Tier 3: Encrypted file (only if passphrase is provided — explicit opt-in)
 *
 * If no backend is available, throws with guidance.
 */
export async function detectAndCreate(
  basePath: string,
  passphrase?: string,
): Promise<DetectionResult> {
  // Tier 1: macOS — Swift helper (Secure Enclave → software keychain)
  if (platform() === 'darwin') {
    try {
      const { isMacOSKeychainAvailable, MacOSKeychainKeyStore } = await import(
        './drivers/macos-keychain.js'
      );
      const { available, backend } = await isMacOSKeychainAvailable();
      if (available) {
        const keyStore = new MacOSKeychainKeyStore(basePath);
        if (backend === 'keychain') {
          return {
            backend: 'keychain',
            keyStore,
            warning:
              'Secure Enclave not available (binary not signed). Using macOS Keychain (software-protected).',
          };
        }
        return { backend: 'secure-enclave', keyStore };
      }
    } catch {
      // Swift helper not found or not compiled — fall through
    }
  }

  // Tier 2: Linux TPM 2.0
  if (platform() === 'linux') {
    try {
      const { isTPM2Available, TPMKeyStore } = await import('./drivers/tpm.js');
      if (await isTPM2Available()) {
        return { backend: 'tpm2', keyStore: new TPMKeyStore(basePath) };
      }
    } catch {
      // tpm2-tools not installed — fall through
    }
  }

  // Tier 3: Encrypted file — only if passphrase was explicitly provided
  if (passphrase) {
    const { EncryptedFileKeyStore } = await import('./drivers/encrypted-file.js');
    return {
      backend: 'encrypted-file',
      keyStore: new EncryptedFileKeyStore(basePath, passphrase),
      warning:
        'Using file-based key storage. Keys are protected by filesystem permissions and a passphrase, not hardware. ' +
        'For hardware-backed storage, use macOS or a Linux host with TPM 2.0.',
    };
  }

  throw new Error(
    'No supported key storage backend detected.\n' +
      '  • macOS: Secure Enclave or Keychain (requires amesh-se-helper)\n' +
      '  • Linux: TPM 2.0 (requires tpm2-tools)\n' +
      '  • Any platform: --backend file --passphrase <passphrase> (file-based, explicit opt-in)',
  );
}

/**
 * Create a keystore for a specific backend (used when backend is already known).
 */
export async function createForBackend(
  backend: StorageBackend,
  basePath: string,
  passphrase?: string,
): Promise<KeyStore> {
  switch (backend) {
    case 'secure-enclave':
    case 'keychain': {
      const { MacOSKeychainKeyStore } = await import('./drivers/macos-keychain.js');
      return new MacOSKeychainKeyStore(basePath);
    }
    case 'tpm2': {
      const { TPMKeyStore } = await import('./drivers/tpm.js');
      return new TPMKeyStore(basePath);
    }
    case 'encrypted-file': {
      if (!passphrase) {
        throw new Error(
          'Encrypted-file backend requires a passphrase. ' +
            'Set AUTH_MESH_PASSPHRASE or pass --passphrase.',
        );
      }
      const { EncryptedFileKeyStore } = await import('./drivers/encrypted-file.js');
      return new EncryptedFileKeyStore(basePath, passphrase);
    }
    default:
      throw new Error(`Unsupported storage backend: ${backend}`);
  }
}
