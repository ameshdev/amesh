import { createForBackend, AllowList } from '@authmesh/keystore';
import type { KeyStore, StorageBackend } from '@authmesh/keystore';
import { loadIdentity, saveIdentity } from './identity.js';
import type { Identity } from './identity.js';
import { getIdentityPath, getAllowListPath, getKeysDir, resolvePassphrase } from './paths.js';

export interface AmeshContext {
  identity: Identity;
  keyStore: KeyStore;
  allowList: AllowList;
  /** The internal key name in the keystore (may differ from deviceId for keychain/TPM) */
  keyAlias: string;
}

export async function loadContext(): Promise<AmeshContext> {
  const identity = await loadIdentity(getIdentityPath());

  // H2 — passphrase lives in a dedicated file, not identity.json. For legacy
  // installs we auto-migrate by reading identity.passphrase, writing it to
  // the dedicated file, and clearing the field from identity.json on disk.
  const { passphrase, migratedFromIdentity } = await resolvePassphrase(identity);
  if (migratedFromIdentity) {
    await saveIdentity(getIdentityPath(), identity);
  }

  const keyStore = await createForBackend(
    identity.storageBackend as StorageBackend,
    getKeysDir(),
    passphrase,
  );

  const keyAlias = identity.keyAlias ?? identity.deviceId;

  const hmacKey = await keyStore.getHmacKeyMaterial(keyAlias);
  const allowList = new AllowList(getAllowListPath(), hmacKey, identity.deviceId);

  return { identity, keyStore, allowList, keyAlias };
}
