import { platform } from 'node:os';
import type { KeyStore } from './interface.js';
import { EncryptedFileKeyStore } from './drivers/encrypted-file.js';

export type StorageBackend = 'secure-enclave' | 'keychain' | 'tpm2' | 'encrypted-file';

export interface DetectionResult {
  backend: StorageBackend;
  keyStore: KeyStore;
  warning?: string;
}

/**
 * Detect the best available keystore backend and create an instance.
 *
 * Fallback chain:
 *   Tier 1: macOS Keychain (tries Secure Enclave first, falls back to software keychain)
 *   Tier 2: TPM 2.0 (Linux)
 *   Tier 3: Encrypted file (last resort, requires passphrase)
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
        const keyStore = new MacOSKeychainKeyStore();
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
        return { backend: 'tpm2', keyStore: new TPMKeyStore() };
      }
    } catch {
      // tpm2-tools not installed — fall through
    }
  }

  // Tier 3: Encrypted file
  if (!passphrase) {
    throw new Error(
      'No hardware security module or OS keyring found. ' +
        'Encrypted file fallback requires a passphrase. ' +
        'Pass --passphrase or set AUTH_MESH_PASSPHRASE.',
    );
  }

  return {
    backend: 'encrypted-file',
    keyStore: new EncryptedFileKeyStore(basePath, passphrase),
    warning:
      'Running in degraded security mode. Key is protected only by your passphrase. ' +
      'Not recommended for production.',
  };
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
    case 'encrypted-file':
      if (!passphrase) throw new Error('Encrypted file backend requires a passphrase');
      return new EncryptedFileKeyStore(basePath, passphrase);
    case 'secure-enclave':
    case 'keychain': {
      const { MacOSKeychainKeyStore } = await import('./drivers/macos-keychain.js');
      return new MacOSKeychainKeyStore();
    }
    case 'tpm2': {
      const { TPMKeyStore } = await import('./drivers/tpm.js');
      return new TPMKeyStore();
    }
    default:
      throw new Error(`Unknown storage backend: ${backend}`);
  }
}
