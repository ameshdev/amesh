import { createForBackend, AllowList } from '@authmesh/keystore';
import type { KeyStore, StorageBackend } from '@authmesh/keystore';
import { loadIdentity } from './identity.js';
import type { Identity } from './identity.js';
import { getIdentityPath, getAllowListPath, getKeysDir } from './paths.js';

export interface AmeshContext {
  identity: Identity;
  keyStore: KeyStore;
  allowList: AllowList;
  /** The internal key name in the keystore (may differ from deviceId for keychain/TPM) */
  keyAlias: string;
}

export async function loadContext(): Promise<AmeshContext> {
  const identity = await loadIdentity(getIdentityPath());

  const keyStore = await createForBackend(
    identity.storageBackend as StorageBackend,
    getKeysDir(),
    process.env.AUTH_MESH_PASSPHRASE,
  );

  // keyAlias: the name used in the keystore. Defaults to deviceId for backwards compat.
  const keyAlias = (identity as Identity & { keyAlias?: string }).keyAlias ?? identity.deviceId;

  const hmacKey = await keyStore.getHmacKeyMaterial(keyAlias);
  const allowList = new AllowList(getAllowListPath(), hmacKey, identity.deviceId);

  return { identity, keyStore, allowList, keyAlias };
}
