import { describe, it, expect } from 'vitest';
import { p256 } from '@noble/curves/nist.js';
import { signMessage, verifyMessage } from '../crypto.js';
import { buildCanonicalString } from '../canonical.js';
import { InMemoryNonceStore } from '../nonce.js';

function makeKeyPair() {
  const privateKey = p256.utils.randomSecretKey();
  const publicKey = p256.getPublicKey(privateKey, true);
  return { privateKey, publicKey };
}

describe('full request signing + verification flow', () => {
  it('sign request → verify request (happy path)', () => {
    const { privateKey, publicKey } = makeKeyPair();
    const now = Math.floor(Date.now() / 1000);

    const canonical = buildCanonicalString(
      'POST',
      '/api/orders?b=2&a=1',
      now.toString(),
      'dGVzdG5vbmNl',
      '{"amount":100}',
    );

    const message = new TextEncoder().encode(canonical);
    const sig = signMessage(privateKey, message);
    expect(verifyMessage(sig, message, publicKey)).toBe(true);
  });

  it('rejects when body is tampered after signing', () => {
    const { privateKey, publicKey } = makeKeyPair();
    const now = Math.floor(Date.now() / 1000);

    // Sign with body A
    const canonicalA = buildCanonicalString('POST', '/api', now.toString(), 'nonce1', '{"a":1}');
    const sig = signMessage(privateKey, new TextEncoder().encode(canonicalA));

    // Verify with body B
    const canonicalB = buildCanonicalString('POST', '/api', now.toString(), 'nonce1', '{"a":2}');
    expect(verifyMessage(sig, new TextEncoder().encode(canonicalB), publicKey)).toBe(false);
  });

  it('rejects when method is changed after signing', () => {
    const { privateKey, publicKey } = makeKeyPair();
    const ts = '1743160800';

    const signed = buildCanonicalString('POST', '/api', ts, 'n', '');
    const sig = signMessage(privateKey, new TextEncoder().encode(signed));

    const tampered = buildCanonicalString('DELETE', '/api', ts, 'n', '');
    expect(verifyMessage(sig, new TextEncoder().encode(tampered), publicKey)).toBe(false);
  });

  it('rejects when path is changed after signing', () => {
    const { privateKey, publicKey } = makeKeyPair();
    const ts = '1743160800';

    const signed = buildCanonicalString('GET', '/api/users', ts, 'n', '');
    const sig = signMessage(privateKey, new TextEncoder().encode(signed));

    const tampered = buildCanonicalString('GET', '/api/admin', ts, 'n', '');
    expect(verifyMessage(sig, new TextEncoder().encode(tampered), publicKey)).toBe(false);
  });

  it('rejects when timestamp is changed (clock attack)', () => {
    const { privateKey, publicKey } = makeKeyPair();
    const now = Math.floor(Date.now() / 1000);

    const signed = buildCanonicalString('GET', '/api', now.toString(), 'n', '');
    const sig = signMessage(privateKey, new TextEncoder().encode(signed));

    // Attacker replays with different timestamp
    const tampered = buildCanonicalString('GET', '/api', (now + 60).toString(), 'n', '');
    expect(verifyMessage(sig, new TextEncoder().encode(tampered), publicKey)).toBe(false);
  });

  it('rejects when id is swapped (different device key)', () => {
    const attacker = makeKeyPair();
    const legitimate = makeKeyPair();

    const canonical = buildCanonicalString('GET', '/api', '1000', 'n', '');
    const message = new TextEncoder().encode(canonical);

    // Attacker signs with their key
    const sig = signMessage(attacker.privateKey, message);

    // Server verifies against legitimate device's public key
    expect(verifyMessage(sig, message, legitimate.publicKey)).toBe(false);
  });
});

describe('nonce + signing integration (replay prevention)', () => {
  it('accepts first request, rejects replay', async () => {
    const { privateKey, publicKey } = makeKeyPair();
    const store = new InMemoryNonceStore();
    const nonce = 'unique-nonce-abc';
    const now = Math.floor(Date.now() / 1000);

    const canonical = buildCanonicalString('GET', '/api', now.toString(), nonce, '');
    const message = new TextEncoder().encode(canonical);
    const sig = signMessage(privateKey, message);

    // First request: signature valid + nonce fresh
    expect(verifyMessage(sig, message, publicKey)).toBe(true);
    expect(await store.checkAndRecord(nonce, 60)).toBe(true);

    // Replay: signature still valid but nonce rejected
    expect(verifyMessage(sig, message, publicKey)).toBe(true);
    expect(await store.checkAndRecord(nonce, 60)).toBe(false);

    await store.close();
  });
});
