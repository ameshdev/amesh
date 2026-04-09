import { describe, it, expect } from 'bun:test';
import { p256 } from '@noble/curves/nist.js';
import { signMessage, verifyMessage } from '@authmesh/core';
import { buildShellSigMessage } from '../shell-handshake.js';

/**
 * Regression test for C1 — shell handshake MITM via unbound selfSig.
 *
 * A valid selfSig must verify ONLY against the ECDH transcript that the peer
 * actually saw. A relay-MITM that substitutes its own ephemeral keys on each
 * leg must not be able to replay a captured selfSig from one leg to the other.
 */
describe('shell handshake signature binding (C1)', () => {
  function makeIdentity(friendlyName: string, deviceId: string) {
    const privateKey = p256.utils.randomSecretKey();
    const publicKey = p256.getPublicKey(privateKey, true);
    return {
      privateKey,
      publicKey,
      publicKeyBase64: Buffer.from(publicKey).toString('base64'),
      friendlyName,
      deviceId,
    };
  }

  function randomEphemeralPub(): Uint8Array {
    return p256.getPublicKey(p256.utils.randomSecretKey(), true);
  }

  it('a signature bound to ephemeral pair (A,B) does not verify against pair (A,C)', () => {
    const controller = makeIdentity('ctrl', 'am_ctrl1234567890');

    const legitControllerEph = randomEphemeralPub();
    const legitAgentEph = randomEphemeralPub();
    const attackerEph = randomEphemeralPub();

    const timestamp = new Date().toISOString();

    const msgForLegA = buildShellSigMessage({
      publicKey: controller.publicKeyBase64,
      deviceId: controller.deviceId,
      friendlyName: controller.friendlyName,
      timestamp,
      signerEphPub: legitControllerEph,
      verifierEphPub: legitAgentEph,
    });
    const sig = signMessage(controller.privateKey, msgForLegA);

    expect(verifyMessage(sig, msgForLegA, controller.publicKey)).toBe(true);

    const msgAsSeenByAgent = buildShellSigMessage({
      publicKey: controller.publicKeyBase64,
      deviceId: controller.deviceId,
      friendlyName: controller.friendlyName,
      timestamp,
      signerEphPub: attackerEph,
      verifierEphPub: legitAgentEph,
    });
    expect(verifyMessage(sig, msgAsSeenByAgent, controller.publicKey)).toBe(false);
  });

  it('flipping deviceId, friendlyName, or timestamp invalidates the signature', () => {
    const id = makeIdentity('alice', 'am_alice1234567890');
    const signerEph = randomEphemeralPub();
    const verifierEph = randomEphemeralPub();
    const timestamp = new Date().toISOString();

    const base = {
      publicKey: id.publicKeyBase64,
      deviceId: id.deviceId,
      friendlyName: id.friendlyName,
      timestamp,
      signerEphPub: signerEph,
      verifierEphPub: verifierEph,
    };

    const sig = signMessage(id.privateKey, buildShellSigMessage(base));
    expect(verifyMessage(sig, buildShellSigMessage(base), id.publicKey)).toBe(true);

    expect(
      verifyMessage(
        sig,
        buildShellSigMessage({ ...base, deviceId: 'am_mallory1234' }),
        id.publicKey,
      ),
    ).toBe(false);

    expect(
      verifyMessage(sig, buildShellSigMessage({ ...base, friendlyName: 'mallory' }), id.publicKey),
    ).toBe(false);

    expect(
      verifyMessage(
        sig,
        buildShellSigMessage({ ...base, timestamp: new Date(Date.now() + 1000).toISOString() }),
        id.publicKey,
      ),
    ).toBe(false);
  });

  it('domain separator prevents cross-protocol signature reuse', () => {
    const id = makeIdentity('bob', 'am_bob9999999999');
    const signerEph = randomEphemeralPub();
    const verifierEph = randomEphemeralPub();
    const timestamp = new Date().toISOString();

    const shellMsg = buildShellSigMessage({
      publicKey: id.publicKeyBase64,
      deviceId: id.deviceId,
      friendlyName: id.friendlyName,
      timestamp,
      signerEphPub: signerEph,
      verifierEphPub: verifierEph,
    });
    const sig = signMessage(id.privateKey, shellMsg);

    const oldFormatMsg = new TextEncoder().encode(id.publicKeyBase64 + id.friendlyName + timestamp);
    expect(verifyMessage(sig, oldFormatMsg, id.publicKey)).toBe(false);
  });
});
