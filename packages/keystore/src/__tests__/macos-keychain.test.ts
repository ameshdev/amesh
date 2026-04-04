import { describe, it, expect, afterEach, setDefaultTimeout } from 'bun:test';
import { verifyMessage } from '@authmesh/core';

setDefaultTimeout(30_000);

// These tests require the macOS Keychain Swift helper and only run on macOS.
// They use a unique tag prefix to avoid colliding with real amesh keys.
const TEST_DEVICE_ID = 'am_test_keychain_ci';

const isMacOS = process.platform === 'darwin';

// Skip all tests on non-macOS platforms
const describeOnMac = isMacOS ? describe : describe.skip;

// Dynamic import to avoid errors on non-macOS
async function getKeychainStore() {
  const { MacOSKeychainKeyStore, isMacOSKeychainAvailable } =
    await import('../drivers/macos-keychain.js');
  const { available } = await isMacOSKeychainAvailable();
  return { MacOSKeychainKeyStore, available };
}

describeOnMac('MacOSKeychainKeyStore', () => {
  afterEach(async () => {
    // Clean up test keys from keychain
    try {
      const { MacOSKeychainKeyStore } = await getKeychainStore();
      const store = new MacOSKeychainKeyStore('/tmp');
      await store.delete(TEST_DEVICE_ID);
    } catch {
      // ignore cleanup errors
    }
  });

  it('generates a 33-byte compressed P-256 public key', async () => {
    const { MacOSKeychainKeyStore, available } = await getKeychainStore();
    if (!available) return;
    const store = new MacOSKeychainKeyStore('/tmp');
    const { publicKey } = await store.generateAndStore(TEST_DEVICE_ID);

    expect(publicKey).toBeInstanceOf(Uint8Array);
    expect(publicKey.length).toBe(33);
    expect([0x02, 0x03]).toContain(publicKey[0]);
  });

  it('sign produces a verifiable 64-byte signature', async () => {
    const { MacOSKeychainKeyStore, available } = await getKeychainStore();
    if (!available) return;
    const store = new MacOSKeychainKeyStore('/tmp');
    const { publicKey } = await store.generateAndStore(TEST_DEVICE_ID);

    const msg = new TextEncoder().encode('test message');
    const sig = await store.sign(TEST_DEVICE_ID, msg);

    expect(sig.length).toBe(64);
    expect(verifyMessage(sig, msg, publicKey)).toBe(true);
  });

  it('generateAndStore twice with same ID uses the new key (stale key regression)', async () => {
    const { MacOSKeychainKeyStore, available } = await getKeychainStore();
    if (!available) return;
    const store = new MacOSKeychainKeyStore('/tmp');

    // First generate
    const { publicKey: pk1 } = await store.generateAndStore(TEST_DEVICE_ID);

    // Second generate — same device ID (simulates `amesh init --force`)
    const { publicKey: pk2 } = await store.generateAndStore(TEST_DEVICE_ID);

    // Keys should differ
    expect(pk1).not.toEqual(pk2);

    // Sign must use the NEW key
    const msg = new TextEncoder().encode('stale key regression test');
    const sig = await store.sign(TEST_DEVICE_ID, msg);

    // Must verify against the NEW public key
    expect(verifyMessage(sig, msg, pk2)).toBe(true);
    // Must NOT verify against the OLD public key
    expect(verifyMessage(sig, msg, pk1)).toBe(false);
  });

  it('getPublicKey returns the new key after overwrite', async () => {
    const { MacOSKeychainKeyStore, available } = await getKeychainStore();
    if (!available) return;
    const store = new MacOSKeychainKeyStore('/tmp');

    await store.generateAndStore(TEST_DEVICE_ID);
    const { publicKey: pk2 } = await store.generateAndStore(TEST_DEVICE_ID);

    const retrieved = await store.getPublicKey(TEST_DEVICE_ID);
    expect(retrieved).toEqual(pk2);
  });

  it('delete removes the key', async () => {
    const { MacOSKeychainKeyStore, available } = await getKeychainStore();
    if (!available) return;
    const store = new MacOSKeychainKeyStore('/tmp');

    await store.generateAndStore(TEST_DEVICE_ID);
    await store.delete(TEST_DEVICE_ID);

    await expect(store.sign(TEST_DEVICE_ID, new TextEncoder().encode('test'))).rejects.toThrow();
  });
});
