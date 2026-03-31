import { platform } from 'node:os';
import type { KeyStore } from './interface.js';

export type StorageBackend = 'secure-enclave' | 'keychain' | 'tpm2';

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
 *
 * If no hardware backend is available, throws. amesh requires hardware-backed key storage.
 */
export async function detectAndCreate(
  basePath: string,
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

  throw new Error(
    'amesh requires hardware-backed key storage (Secure Enclave, macOS Keychain, or TPM 2.0). ' +
      'No supported hardware backend was detected on this machine.',
  );
}

/**
 * Create a keystore for a specific backend (used when backend is already known).
 */
export async function createForBackend(
  backend: StorageBackend,
  basePath: string,
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
    default:
      throw new Error(`Unsupported storage backend: ${backend}`);
  }
}
