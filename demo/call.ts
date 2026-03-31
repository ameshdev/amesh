/**
 * amesh demo — client
 *
 * No API key. No Bearer token. No secret of any kind.
 * Every request is signed with a hardware-bound key.
 *
 * Run: npx tsx call.ts
 */

import { amesh } from '@authmesh/sdk';
import { buildCanonicalString, signMessage } from '@authmesh/core';
import { randomBytes } from '@noble/ciphers/utils.js';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createForBackend } from '@authmesh/keystore';
import type { StorageBackend } from '@authmesh/keystore';
import { buildAuthHeader } from '@authmesh/sdk';

const API = process.env.API_URL ?? 'http://localhost:3000';

function log(label: string, value: unknown) {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  console.log(`  ${label.padEnd(18)} ${str}`);
}

async function run() {
  console.log('');
  console.log('  amesh demo — client');
  console.log('');

  // 1. Public endpoint
  console.log('  -- Step 1: Public endpoint (no auth) --');
  const health = await fetch(`${API}/health`);
  log('Status:', `${health.status}`);
  log('Response:', await health.json());
  console.log('');

  // 2. Protected without auth (expect 400)
  console.log('  -- Step 2: Protected without auth (expect 400) --');
  const noAuth = await fetch(`${API}/api/orders`);
  log('Status:', `${noAuth.status}`);
  log('Response:', await noAuth.json());
  console.log('');

  // 3. Protected GET with amesh.fetch()
  console.log('  -- Step 3: Signed GET with amesh.fetch() --');
  const getRes = await amesh.fetch(`${API}/api/orders`);
  log('Status:', `${getRes.status}`);
  const getData = await getRes.json() as any;
  log('Device:', getData.authenticatedAs);
  log('Orders:', getData.orders);
  console.log('');

  // 4. Protected POST with amesh.fetch()
  console.log('  -- Step 4: Signed POST with amesh.fetch() --');
  const postRes = await amesh.fetch(`${API}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item: 'Standing Desk', amount: 59900 }),
  });
  log('Status:', `${postRes.status}`);
  log('Order:', await postRes.json());
  console.log('');

  // 5. Replay attack — send the exact same signed request twice
  console.log('  -- Step 5: Replay attack (expect 401 on second) --');

  // Build a signed request manually with a fixed nonce
  const ameshDir = process.env.AUTH_MESH_DIR ?? join(homedir(), '.amesh');
  const identity = JSON.parse(await readFile(join(ameshDir, 'identity.json'), 'utf-8'));
  const keyAlias = identity.keyAlias ?? identity.deviceId;
  const keyStore = await createForBackend(identity.storageBackend as StorageBackend, join(ameshDir, 'keys'));

  const ts = Math.floor(Date.now() / 1000).toString();
  const nonce = Buffer.from(randomBytes(16)).toString('base64url');
  const canonical = buildCanonicalString('GET', '/api/orders', ts, nonce, '');
  const sig = await keyStore.sign(keyAlias, new TextEncoder().encode(canonical));

  const authHeader = buildAuthHeader({
    v: '1', id: identity.publicKey, ts, nonce,
    sig: Buffer.from(sig).toString('base64url'),
  });
  const headers = { Authorization: authHeader };

  const r1 = await fetch(`${API}/api/orders`, { headers });
  const r2 = await fetch(`${API}/api/orders`, { headers });

  log('First request:', `${r1.status}`);
  log('Replay attempt:', `${r2.status}`);
  if (r2.status === 401) {
    console.log('  Replay rejected. Nonce store working.');
  }
  console.log('');

  // Summary
  console.log('  -- Done --');
  console.log('  No API key. No Bearer token. No .env file.');
  console.log('  The private key never left this machine.');
  console.log('');
}

run().catch((err) => {
  console.error('  Demo failed:', err.message);
  console.error('  Is the server running? Have you paired the devices?');
  process.exit(1);
});
