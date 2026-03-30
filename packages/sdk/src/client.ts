import { buildCanonicalString } from '@authmesh/core';
import { randomBytes } from '@noble/ciphers/utils.js';
import type { KeyStore } from '@authmesh/keystore';
import { buildAuthHeader } from './header.js';

export interface AuthMeshClientOptions {
  deviceId: string;
  publicKeyBase64: string;
  keyStore: KeyStore;
}

/**
 * AuthMeshClient — signs outgoing HTTP requests with the device's P-256 identity.
 *
 * Usage:
 *   const client = new AuthMeshClient({ deviceId, publicKeyBase64, keyStore });
 *   const response = await client.fetch('https://api.example.com/data', {
 *     method: 'POST',
 *     body: JSON.stringify({ hello: 'world' }),
 *   });
 */
export class AuthMeshClient {
  private readonly deviceId: string;
  private readonly publicKeyBase64: string;
  private readonly keyStore: KeyStore;

  constructor(opts: AuthMeshClientOptions) {
    this.deviceId = opts.deviceId;
    this.publicKeyBase64 = opts.publicKeyBase64;
    this.keyStore = opts.keyStore;
  }

  /**
   * Fetch wrapper that signs the request with AuthMesh credentials.
   * Compatible with the standard fetch API.
   */
  async fetch(url: string | URL, init?: RequestInit): Promise<Response> {
    const parsedUrl = new URL(url);
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? String(init.body) : '';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = Buffer.from(randomBytes(16)).toString('base64url');

    const path = parsedUrl.pathname + parsedUrl.search;
    const canonical = buildCanonicalString(method, path, timestamp, nonce, body);
    const message = new TextEncoder().encode(canonical);

    // Sign using the keystore (private key never exposed)
    const sig = await this.keyStore.sign(this.deviceId, message);

    const authHeader = buildAuthHeader({
      v: '1',
      id: this.publicKeyBase64,
      ts: timestamp,
      nonce,
      sig: Buffer.from(sig).toString('base64url'),
    });

    const headers = new Headers(init?.headers);
    headers.set('Authorization', authHeader);

    return globalThis.fetch(url, {
      ...init,
      headers,
    });
  }
}
