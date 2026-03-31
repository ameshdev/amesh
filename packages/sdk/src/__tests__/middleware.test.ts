import { describe, it, expect, beforeAll } from 'bun:test';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { p256 } from '@noble/curves/nist.js';
import { randomBytes } from '@noble/ciphers/utils.js';
import { buildCanonicalString, signMessage } from '@authmesh/core';
import { AllowList } from '@authmesh/keystore';
import { authMeshVerify } from '../middleware.js';
import { buildAuthHeader } from '../header.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Test identity
const privateKey = p256.utils.randomSecretKey();
const publicKey = p256.getPublicKey(privateKey, true);
const publicKeyBase64 = Buffer.from(publicKey).toString('base64');
const hmacKeyMaterial = new Uint8Array(32).fill(0xab);
const deviceId = 'am_testdev123';

let tempDir: string;
let allowList: AllowList;
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'amesh-sdk-'));
  allowList = new AllowList(join(tempDir, 'allow_list.json'), hmacKeyMaterial, 'am_server');

  // Add our test device to the allow list as a controller (can authenticate)
  await allowList.addDevice({
    deviceId,
    publicKey: publicKeyBase64,
    friendlyName: 'Test Device',
    addedAt: new Date().toISOString(),
    addedBy: 'handshake',
    role: 'controller',
  });

  const middleware = authMeshVerify({ allowList, clockSkewSeconds: 30, nonceWindowSeconds: 60 });

  server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Buffer body for verification
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    (req as IncomingMessage & { body: string }).body = Buffer.concat(chunks).toString();

    middleware(req as IncomingMessage & { body: string }, res, () => {
      const identity = (req as IncomingMessage & { authMesh?: { deviceId: string } }).authMesh;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, deviceId: identity?.deviceId }));
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const addr = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;

  return async () => {
    server.close();
    await rm(tempDir, { recursive: true, force: true });
  };
});

function signRequest(method: string, path: string, body = '') {
  const ts = Math.floor(Date.now() / 1000).toString();
  const nonce = Buffer.from(randomBytes(16)).toString('base64url');
  const canonical = buildCanonicalString(method, path, ts, nonce, body);
  const message = new TextEncoder().encode(canonical);
  const sig = signMessage(privateKey, message);

  return buildAuthHeader({
    v: '1',
    id: publicKeyBase64,
    ts,
    nonce,
    sig: Buffer.from(sig).toString('base64url'),
  });
}

async function request(method: string, path: string, opts?: { auth?: string; body?: string }) {
  const headers: Record<string, string> = {};
  if (opts?.auth) headers['Authorization'] = opts.auth;
  if (opts?.body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: opts?.body,
  });
  return { status: res.status, body: await res.json() };
}

describe('authMeshVerify middleware', () => {
  // Happy path
  it('accepts valid signed GET request', async () => {
    const auth = signRequest('GET', '/api/data');
    const res = await request('GET', '/api/data', { auth });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.deviceId).toBe(deviceId);
  });

  it('accepts valid signed POST request with body', async () => {
    const body = '{"amount":100}';
    const auth = signRequest('POST', '/api/orders', body);
    const res = await request('POST', '/api/orders', { auth, body });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('accepts request with sorted query params', async () => {
    const auth = signRequest('GET', '/api?b=2&a=1');
    const res = await request('GET', '/api?b=2&a=1', { auth });
    expect(res.status).toBe(200);
  });

  // Step 1 — Missing header
  it('rejects request without Authorization header (400)', async () => {
    const res = await request('GET', '/api/data');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('missing_header');
  });

  // Step 1 — Malformed header
  it('rejects malformed Authorization header (400)', async () => {
    const res = await request('GET', '/api/data', { auth: 'Bearer xyz' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('malformed_header');
  });

  // Step 2 — Wrong version
  it('rejects unsupported version (400)', async () => {
    const ts = Math.floor(Date.now() / 1000).toString();
    const nonce = Buffer.from(randomBytes(16)).toString('base64url');
    const canonical = buildCanonicalString('GET', '/api', ts, nonce, '');
    const sig = signMessage(privateKey, new TextEncoder().encode(canonical));
    const auth = buildAuthHeader({
      v: '2', // wrong version
      id: publicKeyBase64,
      ts,
      nonce,
      sig: Buffer.from(sig).toString('base64url'),
    });
    const res = await request('GET', '/api', { auth });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('unsupported_version');
  });

  // Step 3 — Unknown device
  it('rejects unknown device (401)', async () => {
    const unknownPriv = p256.utils.randomSecretKey();
    const unknownPub = p256.getPublicKey(unknownPriv, true);
    const unknownPubB64 = Buffer.from(unknownPub).toString('base64');
    const ts = Math.floor(Date.now() / 1000).toString();
    const nonce = Buffer.from(randomBytes(16)).toString('base64url');
    const canonical = buildCanonicalString('GET', '/api', ts, nonce, '');
    const sig = signMessage(unknownPriv, new TextEncoder().encode(canonical));
    const auth = buildAuthHeader({
      v: '1',
      id: unknownPubB64,
      ts,
      nonce,
      sig: Buffer.from(sig).toString('base64url'),
    });
    const res = await request('GET', '/api', { auth });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('unauthorized');
  });

  // Step 4 — Clock skew
  it('rejects request with timestamp too far in future (401)', async () => {
    const ts = (Math.floor(Date.now() / 1000) + 60).toString(); // 60s ahead
    const nonce = Buffer.from(randomBytes(16)).toString('base64url');
    const canonical = buildCanonicalString('GET', '/api', ts, nonce, '');
    const sig = signMessage(privateKey, new TextEncoder().encode(canonical));
    const auth = buildAuthHeader({
      v: '1',
      id: publicKeyBase64,
      ts,
      nonce,
      sig: Buffer.from(sig).toString('base64url'),
    });
    const res = await request('GET', '/api', { auth });
    expect(res.status).toBe(401);
  });

  // Step 5 — Replay
  it('rejects replay (same nonce twice) (401)', async () => {
    const ts = Math.floor(Date.now() / 1000).toString();
    const nonce = Buffer.from(randomBytes(16)).toString('base64url');
    const canonical = buildCanonicalString('GET', '/api/replay', ts, nonce, '');
    const sig = signMessage(privateKey, new TextEncoder().encode(canonical));
    const auth = buildAuthHeader({
      v: '1',
      id: publicKeyBase64,
      ts,
      nonce,
      sig: Buffer.from(sig).toString('base64url'),
    });

    // First request succeeds
    const res1 = await request('GET', '/api/replay', { auth });
    expect(res1.status).toBe(200);

    // Replay rejected
    const res2 = await request('GET', '/api/replay', { auth });
    expect(res2.status).toBe(401);
  });

  // Step 7 — Tampered body
  it('rejects request with tampered body (401)', async () => {
    const originalBody = '{"amount":100}';
    const auth = signRequest('POST', '/api/orders', originalBody);
    // Send different body than what was signed
    const res = await request('POST', '/api/orders', { auth, body: '{"amount":999}' });
    expect(res.status).toBe(401);
  });

  // Step 7 — Tampered path
  it('rejects request with wrong signature for path (401)', async () => {
    const auth = signRequest('GET', '/api/users');
    // Send to different path
    const res = await request('GET', '/api/admin', { auth });
    expect(res.status).toBe(401);
  });

  // Step 3b — Directionality: target role cannot authenticate
  it('rejects request from device with role "target" (401)', async () => {
    // Create a separate allow list with a target-role device
    const targetPriv = p256.utils.randomSecretKey();
    const targetPub = p256.getPublicKey(targetPriv, true);
    const targetPubB64 = Buffer.from(targetPub).toString('base64');

    // Add the target device to the server's allow list
    await allowList.addDevice({
      deviceId: 'am_targetdev',
      publicKey: targetPubB64,
      friendlyName: 'Target Device',
      addedAt: new Date().toISOString(),
      addedBy: 'handshake',
      role: 'target',
    });

    const ts = Math.floor(Date.now() / 1000).toString();
    const nonce = Buffer.from(randomBytes(16)).toString('base64url');
    const canonical = buildCanonicalString('GET', '/api', ts, nonce, '');
    const sig = signMessage(targetPriv, new TextEncoder().encode(canonical));
    const auth = buildAuthHeader({
      v: '1',
      id: targetPubB64,
      ts,
      nonce,
      sig: Buffer.from(sig).toString('base64url'),
    });
    const res = await request('GET', '/api', { auth });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('unauthorized');
  });

  // Step 7 — Swapped ID (wrong key signs, header claims another key)
  it('rejects when id and signature mismatch (401)', async () => {
    const attackerPriv = p256.utils.randomSecretKey();
    const ts = Math.floor(Date.now() / 1000).toString();
    const nonce = Buffer.from(randomBytes(16)).toString('base64url');
    const canonical = buildCanonicalString('GET', '/api', ts, nonce, '');
    // Attacker signs with their key but claims our public key
    const sig = signMessage(attackerPriv, new TextEncoder().encode(canonical));
    const auth = buildAuthHeader({
      v: '1',
      id: publicKeyBase64, // legitimate device's key
      ts,
      nonce,
      sig: Buffer.from(sig).toString('base64url'), // attacker's signature
    });
    const res = await request('GET', '/api', { auth });
    expect(res.status).toBe(401);
  });
});
