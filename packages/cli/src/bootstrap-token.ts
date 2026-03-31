import { verifyMessage } from '@authmesh/core';
import { randomBytes } from '@noble/ciphers/utils.js';
import type { KeyStore } from '@authmesh/keystore';

export interface BootstrapTokenHeader {
  typ: 'amesh-bootstrap';
  ver: '1';
  alg: 'ES256';
}

export interface BootstrapTokenPayload {
  iss: string; // controller device ID
  pub: string; // controller public key (base64, compressed P-256)
  iat: number; // issued at (unix seconds)
  exp: number; // expiry (unix seconds)
  jti: string; // unique token ID
  name: string; // friendly name for the target
  relay: string; // relay URL
  scope: 'peer:add';
  single_use: true;
}

const MAX_TTL = 86400; // 24 hours
const PREFIX = 'amesh-bt-v1';

function b64url(data: string): string {
  return Buffer.from(data).toString('base64url');
}

function b64urlDecode(encoded: string): string {
  return Buffer.from(encoded, 'base64url').toString();
}

/**
 * Generate a bootstrap token signed by the controller's key.
 */
export async function generateBootstrapToken(opts: {
  issuerDeviceId: string;
  keyAlias?: string;
  name: string;
  ttlSeconds: number;
  relay: string;
  keyStore: KeyStore;
}): Promise<{ token: string; payload: BootstrapTokenPayload }> {
  if (opts.ttlSeconds > MAX_TTL) {
    throw new Error('ttl cannot exceed 24 hours');
  }

  const now = Math.floor(Date.now() / 1000);
  const jti = `bt_${Buffer.from(randomBytes(16)).toString('hex')}`;
  const keyAlias = opts.keyAlias ?? opts.issuerDeviceId;
  const publicKey = await opts.keyStore.getPublicKey(keyAlias);

  const header: BootstrapTokenHeader = { typ: 'amesh-bootstrap', ver: '1', alg: 'ES256' };
  const payload: BootstrapTokenPayload = {
    iss: opts.issuerDeviceId,
    pub: Buffer.from(publicKey).toString('base64'),
    iat: now,
    exp: now + opts.ttlSeconds,
    jti,
    name: opts.name,
    relay: opts.relay,
    scope: 'peer:add',
    single_use: true,
  };

  const headerB64 = b64url(JSON.stringify(header));
  const payloadB64 = b64url(JSON.stringify(payload));
  const sigInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const sig = await opts.keyStore.sign(keyAlias, sigInput);

  const token = `${PREFIX}.${headerB64}.${payloadB64}.${Buffer.from(sig).toString('base64url')}`;
  return { token, payload };
}

/**
 * Decode a bootstrap token without verifying the signature.
 */
export function decodeBootstrapToken(token: string): {
  header: BootstrapTokenHeader;
  payload: BootstrapTokenPayload;
  signatureInput: string;
  signature: Uint8Array;
} {
  if (!token.startsWith(`${PREFIX}.`)) {
    throw new Error('invalid_token_format');
  }

  const parts = token.slice(PREFIX.length + 1).split('.');
  if (parts.length !== 3) throw new Error('invalid_token_format');

  const [headerB64, payloadB64, sigB64] = parts;
  const header = JSON.parse(b64urlDecode(headerB64)) as BootstrapTokenHeader;
  const payload = JSON.parse(b64urlDecode(payloadB64)) as BootstrapTokenPayload;
  const signature = new Uint8Array(Buffer.from(sigB64, 'base64url'));

  if (header.typ !== 'amesh-bootstrap') throw new Error('invalid_token_type');
  if (header.ver !== '1') throw new Error('unsupported_token_version');

  return { header, payload, signatureInput: `${headerB64}.${payloadB64}`, signature };
}

/**
 * Validate a bootstrap token: check expiry and verify signature.
 */
export function validateBootstrapToken(
  token: string,
  controllerPublicKey: Uint8Array,
): BootstrapTokenPayload {
  const { payload, signatureInput, signature } = decodeBootstrapToken(token);

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) throw new Error('token_expired');

  const message = new TextEncoder().encode(signatureInput);
  if (!verifyMessage(signature, message, controllerPublicKey)) {
    throw new Error('invalid_signature');
  }

  return payload;
}
