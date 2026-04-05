import { describe, it, expect } from 'bun:test';
import { p256 } from '@noble/curves/nist.js';
import { signMessage } from '@authmesh/core';
import type { KeyStore } from '@authmesh/keystore';
import {
  generateBootstrapToken,
  validateBootstrapToken,
  decodeBootstrapToken,
} from '../bootstrap-token.js';

/**
 * Regression tests for M6 (iat/alg/scope/single_use enforcement) and
 * hardening of validateBootstrapToken against malformed tokens.
 */
describe('validateBootstrapToken (M6)', () => {
  function makeKeystoreAdapter(privateKey: Uint8Array, publicKey: Uint8Array) {
    // Minimal KeyStore stub: only sign/getPublicKey are used by
    // generateBootstrapToken.
    const store: Partial<KeyStore> = {
      async sign(_deviceId: string, message: Uint8Array) {
        return signMessage(privateKey, message);
      },
      async getPublicKey(_deviceId: string) {
        return publicKey;
      },
    };
    return store as KeyStore;
  }

  async function makeToken(overrides?: { ttlSeconds?: number }) {
    const privateKey = p256.utils.randomSecretKey();
    const publicKey = p256.getPublicKey(privateKey, true);
    const keyStore = makeKeystoreAdapter(privateKey, publicKey);

    const { token } = await generateBootstrapToken({
      issuerDeviceId: 'am_ctrl0123456789',
      keyAlias: 'am_ctrl0123456789',
      name: 'test-target',
      ttlSeconds: overrides?.ttlSeconds ?? 600,
      relay: 'wss://relay.example.com/ws',
      keyStore,
    });

    return { token, privateKey, publicKey };
  }

  it('accepts a freshly generated token', async () => {
    const { token, publicKey } = await makeToken();
    const payload = validateBootstrapToken(token, publicKey);
    expect(payload.single_use).toBe(true);
    expect(payload.scope).toBe('peer:add');
  });

  it('rejects a token whose signature does not match the claimed pub key', async () => {
    const { token } = await makeToken();
    const wrongPub = p256.getPublicKey(p256.utils.randomSecretKey(), true);
    expect(() => validateBootstrapToken(token, wrongPub)).toThrow('invalid_signature');
  });

  it('rejects a token whose iat is in the future beyond allowed skew', async () => {
    const { token, publicKey } = await makeToken();
    // Re-encode with an iat 10 minutes in the future
    const [prefix, headerB64, payloadB64, sigB64] = token.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    payload.iat = Math.floor(Date.now() / 1000) + 600;
    const tamperedPayloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const tamperedToken = [prefix, headerB64, tamperedPayloadB64, sigB64].join('.');
    // Signature will no longer match, so validateBootstrapToken either throws
    // token_not_yet_valid (our new iat check) or invalid_signature. We check
    // the iat branch by first making the sig wrong — this is the same code
    // path an attacker who forges iat would hit.
    expect(() => validateBootstrapToken(tamperedToken, publicKey)).toThrow(
      /token_not_yet_valid|invalid_signature/,
    );
  });

  it('rejects a token with iat far in the future (iat check fires before sig)', async () => {
    // Generate a token by hand so iat is future but signature is valid
    // against the future-iat payload.
    const privateKey = p256.utils.randomSecretKey();
    const publicKey = p256.getPublicKey(privateKey, true);
    const futureIat = Math.floor(Date.now() / 1000) + 600; // 10 min in future

    const header = { typ: 'amesh-bootstrap', ver: '1', alg: 'ES256' };
    const payload = {
      iss: 'am_ctrl0123456789',
      pub: Buffer.from(publicKey).toString('base64'),
      iat: futureIat,
      exp: futureIat + 3600,
      jti: 'bt_future',
      name: 'target',
      relay: 'wss://relay.example.com/ws',
      scope: 'peer:add',
      single_use: true,
    };
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sigInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const sig = signMessage(privateKey, sigInput);
    const sigB64 = Buffer.from(sig).toString('base64url');
    const token = `amesh-bt-v1.${headerB64}.${payloadB64}.${sigB64}`;

    expect(() => validateBootstrapToken(token, publicKey)).toThrow('token_not_yet_valid');
  });

  it('rejects an expired token', async () => {
    const privateKey = p256.utils.randomSecretKey();
    const publicKey = p256.getPublicKey(privateKey, true);
    const past = Math.floor(Date.now() / 1000) - 3600;

    const header = { typ: 'amesh-bootstrap', ver: '1', alg: 'ES256' };
    const payload = {
      iss: 'am_ctrl0123456789',
      pub: Buffer.from(publicKey).toString('base64'),
      iat: past - 100,
      exp: past, // expired an hour ago
      jti: 'bt_expired',
      name: 'target',
      relay: 'wss://relay.example.com/ws',
      scope: 'peer:add',
      single_use: true,
    };
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sigInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const sig = signMessage(privateKey, sigInput);
    const token = `amesh-bt-v1.${headerB64}.${payloadB64}.${Buffer.from(sig).toString('base64url')}`;

    expect(() => validateBootstrapToken(token, publicKey)).toThrow('token_expired');
  });

  it('rejects a token with wrong scope', async () => {
    const privateKey = p256.utils.randomSecretKey();
    const publicKey = p256.getPublicKey(privateKey, true);
    const now = Math.floor(Date.now() / 1000);

    const header = { typ: 'amesh-bootstrap', ver: '1', alg: 'ES256' };
    const payload = {
      iss: 'am_ctrl',
      pub: Buffer.from(publicKey).toString('base64'),
      iat: now,
      exp: now + 600,
      jti: 'bt_badscope',
      name: 'target',
      relay: 'wss://relay.example.com/ws',
      scope: 'peer:read', // wrong scope
      single_use: true,
    };
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sigInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const sig = signMessage(privateKey, sigInput);
    const token = `amesh-bt-v1.${headerB64}.${payloadB64}.${Buffer.from(sig).toString('base64url')}`;

    expect(() => validateBootstrapToken(token, publicKey)).toThrow('unsupported_token_scope');
  });

  it('rejects a token with single_use=false', async () => {
    const privateKey = p256.utils.randomSecretKey();
    const publicKey = p256.getPublicKey(privateKey, true);
    const now = Math.floor(Date.now() / 1000);

    const header = { typ: 'amesh-bootstrap', ver: '1', alg: 'ES256' };
    const payload = {
      iss: 'am_ctrl',
      pub: Buffer.from(publicKey).toString('base64'),
      iat: now,
      exp: now + 600,
      jti: 'bt_multi',
      name: 'target',
      relay: 'wss://relay.example.com/ws',
      scope: 'peer:add',
      single_use: false,
    };
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sigInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const sig = signMessage(privateKey, sigInput);
    const token = `amesh-bt-v1.${headerB64}.${payloadB64}.${Buffer.from(sig).toString('base64url')}`;

    expect(() => validateBootstrapToken(token, publicKey)).toThrow('token_must_be_single_use');
  });

  it('rejects a token with unexpected alg', async () => {
    const privateKey = p256.utils.randomSecretKey();
    const publicKey = p256.getPublicKey(privateKey, true);
    const now = Math.floor(Date.now() / 1000);

    const header = { typ: 'amesh-bootstrap', ver: '1', alg: 'none' }; // attack
    const payload = {
      iss: 'am_ctrl',
      pub: Buffer.from(publicKey).toString('base64'),
      iat: now,
      exp: now + 600,
      jti: 'bt_noalg',
      name: 'target',
      relay: 'wss://relay.example.com/ws',
      scope: 'peer:add',
      single_use: true,
    };
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sigInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const sig = signMessage(privateKey, sigInput);
    const token = `amesh-bt-v1.${headerB64}.${payloadB64}.${Buffer.from(sig).toString('base64url')}`;

    // decodeBootstrapToken already rejects unknown alg via its own check, but
    // we want to prove validateBootstrapToken also surfaces a clear error.
    expect(() => validateBootstrapToken(token, publicKey)).toThrow('unsupported_token_alg');
  });

  it('round-trip: generate and decode exposes payload fields', async () => {
    const { token, publicKey } = await makeToken({ ttlSeconds: 120 });
    const { payload } = decodeBootstrapToken(token);
    expect(payload.scope).toBe('peer:add');
    expect(payload.single_use).toBe(true);
    expect(payload.exp - payload.iat).toBe(120);
    expect(payload.pub).toBe(Buffer.from(publicKey).toString('base64'));
  });
});
