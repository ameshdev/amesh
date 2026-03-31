import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { p256 } from '@noble/curves/nist.js';
import { signMessage } from '@authmesh/core';
import { createRelayServer } from '../server.js';
import {
  runTargetHandshake,
  runControllerHandshake,
  computeSAS,
} from '../../../cli/src/handshake.js';

let relay: ReturnType<typeof createRelayServer>;
let relayUrl: string;

beforeAll(() => {
  relay = createRelayServer({ host: '127.0.0.1', port: 0 });
  const addr = relay.start();
  relayUrl = `ws://127.0.0.1:${addr.port}/ws`;
});

afterAll(() => {
  relay.stop();
});

function makeIdentity() {
  const privateKey = p256.utils.randomSecretKey();
  const publicKey = p256.getPublicKey(privateKey, true);
  return {
    privateKey,
    publicKey,
    publicKeyBase64: Buffer.from(publicKey).toString('base64'),
    friendlyName: `test-device-${Date.now()}`,
    async sign(message: Uint8Array) {
      return signMessage(privateKey, message);
    },
  };
}

describe('full handshake integration', () => {
  it('target and controller complete handshake and get matching SAS', async () => {
    const target = makeIdentity();
    const controller = makeIdentity();
    const otc = '482916';

    const targetPromise = runTargetHandshake(
      relayUrl,
      otc,
      target.publicKeyBase64,
      target.friendlyName,
      target.sign,
    );

    // Small delay so target connects first
    await new Promise((r) => setTimeout(r, 200));

    const controllerPromise = runControllerHandshake(
      relayUrl,
      otc,
      controller.publicKeyBase64,
      controller.friendlyName,
      controller.sign,
    );

    const [targetResult, controllerResult] = await Promise.all([targetPromise, controllerPromise]);

    // Both sides received each other's identity
    expect(Buffer.from(targetResult.peerPublicKey).toString('base64')).toBe(
      controller.publicKeyBase64,
    );
    expect(Buffer.from(controllerResult.peerPublicKey).toString('base64')).toBe(
      target.publicKeyBase64,
    );

    expect(targetResult.peerFriendlyName).toBe(controller.friendlyName);
    expect(controllerResult.peerFriendlyName).toBe(target.friendlyName);

    // SAS codes match (proves no MITM)
    expect(targetResult.sas).toBe(controllerResult.sas);
    expect(targetResult.sas).toMatch(/^\d{6}$/);
  }, 15_000);

  it('controller gets error for nonexistent OTC', async () => {
    const controller = makeIdentity();

    expect(
      runControllerHandshake(
        relayUrl,
        '999999',
        controller.publicKeyBase64,
        controller.friendlyName,
        controller.sign,
      ),
    ).rejects.toThrow();
  }, 10_000);
});

describe('SAS computation', () => {
  it('produces 6-digit code', () => {
    const a = new Uint8Array(33).fill(0x02);
    const b = new Uint8Array(33).fill(0x03);
    const secret = new Uint8Array(33).fill(0xab);
    const sas = computeSAS(a, b, secret);
    expect(sas).toMatch(/^\d{6}$/);
  });

  it('differs when shared secret differs (MITM detection)', () => {
    const a = new Uint8Array(33).fill(0x02);
    const b = new Uint8Array(33).fill(0x03);
    const secret1 = new Uint8Array(33).fill(0xab);
    const secret2 = new Uint8Array(33).fill(0xcd);

    expect(computeSAS(a, b, secret1)).not.toBe(computeSAS(a, b, secret2));
  });

  it('is order-dependent (target vs controller)', () => {
    const a = new Uint8Array(33).fill(0x02);
    const b = new Uint8Array(33).fill(0x03);
    const secret = new Uint8Array(33).fill(0xab);

    expect(computeSAS(a, b, secret)).not.toBe(computeSAS(b, a, secret));
  });
});
