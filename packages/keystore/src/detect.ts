import { platform } from 'node:os';
import { randomBytes } from '@noble/ciphers/utils.js';
import type { KeyStore } from './interface.js';

export type StorageBackend = 'secure-enclave' | 'keychain' | 'tpm2' | 'encrypted-file';

/** Human-readable labels for each storage backend. */
export const BACKEND_LABELS: Record<StorageBackend, string> = {
  'secure-enclave': 'Secure Enclave',
  keychain: 'macOS Keychain',
  tpm2: 'TPM 2.0',
  'encrypted-file': 'Encrypted file',
};

/** Generate a 256-bit random passphrase for the encrypted-file backend. */
export function generatePassphrase(): string {
  return Buffer.from(randomBytes(32)).toString('hex');
}

export interface DetectionResult {
  backend: StorageBackend;
  keyStore: KeyStore;
  warning?: string;
  /** SENSITIVE — auto-generated passphrase for encrypted-file backend. Never log or display. */
  passphrase?: string;
}

/**
 * Detect the best available keystore backend and create an instance.
 *
 * Detection chain:
 *   Tier 1: macOS Keychain (tries Secure Enclave first, falls back to software keychain)
 *   Tier 2: TPM 2.0 (Linux)
 *   Tier 3: Encrypted file (always available — passphrase auto-generated)
 */
export async function detectAndCreate(
  basePath: string,
  onProgress?: (msg: string) => void,
): Promise<DetectionResult> {
  // Tier 1: macOS — Swift helper (Secure Enclave → software keychain)
  if (platform() === 'darwin') {
    try {
      const { isMacOSKeychainAvailable, MacOSKeychainKeyStore } =
        await import('./drivers/macos-keychain.js');
      const { available, backend } = await isMacOSKeychainAvailable();
      if (available) {
        const keyStore = new MacOSKeychainKeyStore(basePath);
        if (backend === 'keychain') {
          onProgress?.('  Secure Enclave    not available (binary not signed)');
          onProgress?.('  macOS Keychain    selected');
          return {
            backend: 'keychain',
            keyStore,
            warning:
              'Secure Enclave not available (binary not signed). Using macOS Keychain (software-protected).',
          };
        }
        onProgress?.('  Secure Enclave    selected');
        return { backend: 'secure-enclave', keyStore };
      }
      onProgress?.('  Secure Enclave    not available');
      onProgress?.('  macOS Keychain    not available');
    } catch {
      onProgress?.('  Secure Enclave    not available (helper not found)');
      onProgress?.('  macOS Keychain    not available');
    }
  }

  // Tier 2: Linux TPM 2.0
  if (platform() === 'linux') {
    try {
      const { isTPM2Available, TPMKeyStore } = await import('./drivers/tpm.js');
      if (await isTPM2Available()) {
        onProgress?.('  TPM 2.0           selected');
        return { backend: 'tpm2', keyStore: new TPMKeyStore(basePath) };
      }
      onProgress?.('  TPM 2.0           not available (tpm2-tools not found)');
    } catch {
      onProgress?.('  TPM 2.0           not available (tpm2-tools not found)');
    }
  }

  // Tier 3: Encrypted file — always available, passphrase auto-generated
  const passphrase = generatePassphrase();
  onProgress?.('  Encrypted file    selected (software fallback)');
  const { EncryptedFileKeyStore } = await import('./drivers/encrypted-file.js');
  return {
    backend: 'encrypted-file',
    keyStore: new EncryptedFileKeyStore(basePath, passphrase),
    passphrase,
    warning:
      'Keys are software-protected (no hardware keystore detected).\n' +
      '  For hardware-backed storage, use macOS (Keychain) or Linux with TPM 2.0, then re-run `amesh init --force`.',
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
            'Set AUTH_MESH_PASSPHRASE or re-run `amesh init` to auto-generate one.',
        );
      }
      const { EncryptedFileKeyStore } = await import('./drivers/encrypted-file.js');
      return new EncryptedFileKeyStore(basePath, passphrase);
    }
    default:
      throw new Error(`Unsupported storage backend: ${backend}`);
  }
}
