import { describe, it, expect } from 'bun:test';
import {
  generateEphemeralKeyPair,
  computeSharedSecret,
  deriveSessionKey,
} from '../ecdh.js';

describe('generateEphemeralKeyPair', () => {
  it('returns private and public keys', () => {
    const { privateKey, publicKey } = generateEphemeralKeyPair();
    expect(privateKey).toBeInstanceOf(Uint8Array);
    expect(publicKey).toBeInstanceOf(Uint8Array);
  });

  it('returns 32-byte private key', () => {
    const { privateKey } = generateEphemeralKeyPair();
    expect(privateKey.length).toBe(32);
  });

  it('returns 33-byte compressed public key', () => {
    const { publicKey } = generateEphemeralKeyPair();
    expect(publicKey.length).toBe(33);
    // Compressed P-256 public keys start with 0x02 or 0x03
    expect([0x02, 0x03]).toContain(publicKey[0]);
  });

  it('generates unique keypairs each time', () => {
    const kp1 = generateEphemeralKeyPair();
    const kp2 = generateEphemeralKeyPair();
    expect(kp1.privateKey).not.toEqual(kp2.privateKey);
    expect(kp1.publicKey).not.toEqual(kp2.publicKey);
  });
});

describe('computeSharedSecret', () => {
  it('produces the same shared secret from both sides', () => {
    const alice = generateEphemeralKeyPair();
    const bob = generateEphemeralKeyPair();

    const secretAB = computeSharedSecret(alice.privateKey, bob.publicKey);
    const secretBA = computeSharedSecret(bob.privateKey, alice.publicKey);

    expect(secretAB).toEqual(secretBA);
  });

  it('returns a 32-byte raw x-coordinate', () => {
    const alice = generateEphemeralKeyPair();
    const bob = generateEphemeralKeyPair();
    const secret = computeSharedSecret(alice.privateKey, bob.publicKey);
    expect(secret).toBeInstanceOf(Uint8Array);
    expect(secret.length).toBe(32);
  });

  it('produces different secrets for different peer keys', () => {
    const alice = generateEphemeralKeyPair();
    const bob = generateEphemeralKeyPair();
    const charlie = generateEphemeralKeyPair();

    const secretAB = computeSharedSecret(alice.privateKey, bob.publicKey);
    const secretAC = computeSharedSecret(alice.privateKey, charlie.publicKey);

    expect(secretAB).not.toEqual(secretAC);
  });

  // Adversarial: MITM scenario — different sessions produce different secrets
  it('detects MITM via different shared secrets', () => {
    const target = generateEphemeralKeyPair();
    const controller = generateEphemeralKeyPair();
    const mitm = generateEphemeralKeyPair();

    // Legitimate: target ↔ controller
    const legitimate = computeSharedSecret(target.privateKey, controller.publicKey);

    // MITM: target ↔ mitm (attacker intercepts)
    const hijacked = computeSharedSecret(target.privateKey, mitm.publicKey);

    expect(legitimate).not.toEqual(hijacked);
  });
});

describe('deriveSessionKey', () => {
  it('returns a 32-byte key', () => {
    const alice = generateEphemeralKeyPair();
    const bob = generateEphemeralKeyPair();
    const shared = computeSharedSecret(alice.privateKey, bob.publicKey);
    const sessionKey = deriveSessionKey(shared);

    expect(sessionKey).toBeInstanceOf(Uint8Array);
    expect(sessionKey.length).toBe(32);
  });

  it('is deterministic for same shared secret', () => {
    const alice = generateEphemeralKeyPair();
    const bob = generateEphemeralKeyPair();
    const shared = computeSharedSecret(alice.privateKey, bob.publicKey);

    const key1 = deriveSessionKey(shared);
    const key2 = deriveSessionKey(shared);
    expect(key1).toEqual(key2);
  });

  it('both sides derive the same session key', () => {
    const alice = generateEphemeralKeyPair();
    const bob = generateEphemeralKeyPair();

    const sharedAB = computeSharedSecret(alice.privateKey, bob.publicKey);
    const sharedBA = computeSharedSecret(bob.privateKey, alice.publicKey);

    const keyA = deriveSessionKey(sharedAB);
    const keyB = deriveSessionKey(sharedBA);

    expect(keyA).toEqual(keyB);
  });

  it('different shared secrets produce different session keys', () => {
    const a = generateEphemeralKeyPair();
    const b = generateEphemeralKeyPair();
    const c = generateEphemeralKeyPair();

    const key1 = deriveSessionKey(computeSharedSecret(a.privateKey, b.publicKey));
    const key2 = deriveSessionKey(computeSharedSecret(a.privateKey, c.publicKey));

    expect(key1).not.toEqual(key2);
  });
});

describe('deriveShellSessionKey', () => {
  it('produces different keys than deriveSessionKey', async () => {
    const { deriveShellSessionKey } = await import('../ecdh.js');
    const a = generateEphemeralKeyPair();
    const b = generateEphemeralKeyPair();
    const shared = computeSharedSecret(a.privateKey, b.publicKey);

    const pairingKey = deriveSessionKey(shared);
    const shellKey = deriveShellSessionKey(shared, 'am_target', 'am_controller');

    expect(pairingKey).not.toEqual(shellKey);
  });

  it('produces different keys for different device ID pairs', async () => {
    const { deriveShellSessionKey } = await import('../ecdh.js');
    const a = generateEphemeralKeyPair();
    const b = generateEphemeralKeyPair();
    const shared = computeSharedSecret(a.privateKey, b.publicKey);

    const key1 = deriveShellSessionKey(shared, 'am_target1', 'am_controller1');
    const key2 = deriveShellSessionKey(shared, 'am_target2', 'am_controller1');

    expect(key1).not.toEqual(key2);
  });

  it('both sides derive the same shell session key', async () => {
    const { deriveShellSessionKey } = await import('../ecdh.js');
    const a = generateEphemeralKeyPair();
    const b = generateEphemeralKeyPair();

    const sharedAB = computeSharedSecret(a.privateKey, b.publicKey);
    const sharedBA = computeSharedSecret(b.privateKey, a.publicKey);

    const keyA = deriveShellSessionKey(sharedAB, 'am_target', 'am_ctrl');
    const keyB = deriveShellSessionKey(sharedBA, 'am_target', 'am_ctrl');

    expect(keyA).toEqual(keyB);
  });
});

describe('full ECDH handshake simulation', () => {
  it('target and controller derive matching session keys', () => {
    // Simulate the handshake from docs/protocol-spec.md Step 5-6
    const targetEphemeral = generateEphemeralKeyPair();
    const controllerEphemeral = generateEphemeralKeyPair();

    // Exchange public keys (via relay)
    const targetShared = computeSharedSecret(
      targetEphemeral.privateKey,
      controllerEphemeral.publicKey,
    );
    const controllerShared = computeSharedSecret(
      controllerEphemeral.privateKey,
      targetEphemeral.publicKey,
    );

    const targetSessionKey = deriveSessionKey(targetShared);
    const controllerSessionKey = deriveSessionKey(controllerShared);

    expect(targetSessionKey).toEqual(controllerSessionKey);
    expect(targetSessionKey.length).toBe(32);
  });
});
