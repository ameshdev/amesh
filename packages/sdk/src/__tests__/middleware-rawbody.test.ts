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

/**
 * Regression tests for M5 — middleware re-serialized parsed bodies with
 * JSON.stringify, which:
 *   (a) silently broke legitimate clients whose JSON formatting differed
 *       (whitespace, numeric normalization, key order, etc.)
 *   (b) hashed a different byte sequence from what the client signed,
 *       relaxing BodyHash binding in ways the spec doesn't authorize.
 *
 * After the fix, the middleware requires RAW bytes (via req.rawBody,
 * req.body as Buffer or string, or by buffering the stream itself) and
 * REFUSES to re-serialize parsed objects — it surfaces a 500 with a
 * clear ordering error instead.
 */

const privateKey = p256.utils.randomSecretKey();
const publicKey = p256.getPublicKey(privateKey, true);
const publicKeyBase64 = Buffer.from(publicKey).toString('base64');
const hmacKeyMaterial = new Uint8Array(32).fill(0xcd);

let tempDir: string;
let allowList: AllowList;
let noParserUrl: string;
let parsedObjectUrl: string;
let rawBodyUrl: string;
let tinyLimitUrl: string;
let servers: Server[] = [];

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'amesh-m5-'));
  allowList = new AllowList(join(tempDir, 'allow_list.json'), hmacKeyMaterial, 'am_server');
  await allowList.addDevice({
    deviceId: 'am_m5test',
    publicKey: publicKeyBase64,
    friendlyName: 'M5 Test',
    addedAt: new Date().toISOString(),
    addedBy: 'handshake',
    role: 'controller',
  });

  const middleware = authMeshVerify({ allowList, clockSkewSeconds: 30, nonceWindowSeconds: 60 });

  // Scenario A — no parser runs before middleware. The middleware buffers
  // the stream itself.
  const noParserServer = createServer((req, res) => {
    middleware(req as IncomingMessage, res, () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise<void>((resolve) => noParserServer.listen(0, '127.0.0.1', resolve));
  noParserUrl = `http://127.0.0.1:${(noParserServer.address() as { port: number }).port}`;
  servers.push(noParserServer);

  // Scenario B — an upstream "parser" consumes the stream into a parsed
  // object WITHOUT populating rawBody. This is the dangerous middleware
  // ordering that used to silently re-serialize and verify a mangled hash.
  const parsedObjectServer = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString('utf-8');
    try {
      (req as IncomingMessage & { body: unknown }).body = JSON.parse(text);
    } catch {
      (req as IncomingMessage & { body: unknown }).body = {};
    }
    // NOTE: no rawBody set — this mirrors a misconfigured express.json()
    middleware(req as IncomingMessage, res, () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise<void>((resolve) => parsedObjectServer.listen(0, '127.0.0.1', resolve));
  parsedObjectUrl = `http://127.0.0.1:${(parsedObjectServer.address() as { port: number }).port}`;
  servers.push(parsedObjectServer);

  // Scenario C — well-configured parser: rawBody is set via the verify hook
  // pattern. This is the recommended way to run a parser before amesh.
  const rawBodyServer = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks);
    // Mimic express.json({ verify: ... }) — raw bytes stashed, then parsed.
    (req as IncomingMessage & { rawBody: Buffer }).rawBody = raw;
    try {
      (req as IncomingMessage & { body: unknown }).body = JSON.parse(raw.toString('utf-8'));
    } catch {
      (req as IncomingMessage & { body: unknown }).body = {};
    }
    middleware(req as IncomingMessage, res, () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise<void>((resolve) => rawBodyServer.listen(0, '127.0.0.1', resolve));
  rawBodyUrl = `http://127.0.0.1:${(rawBodyServer.address() as { port: number }).port}`;
  servers.push(rawBodyServer);

  // Scenario D — tiny 100-byte body cap, used to exercise the
  // payload_too_large path without allocating megabytes in tests.
  const tinyLimitMw = authMeshVerify({
    allowList,
    clockSkewSeconds: 30,
    nonceWindowSeconds: 60,
    maxBodyBytes: 100,
  });
  const tinyLimitServer = createServer((req, res) => {
    tinyLimitMw(req as IncomingMessage, res, () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise<void>((resolve) => tinyLimitServer.listen(0, '127.0.0.1', resolve));
  tinyLimitUrl = `http://127.0.0.1:${(tinyLimitServer.address() as { port: number }).port}`;
  servers.push(tinyLimitServer);

  return async () => {
    for (const s of servers) s.close();
    await rm(tempDir, { recursive: true, force: true });
  };
});

function signRequest(method: string, path: string, body = '') {
  const ts = Math.floor(Date.now() / 1000).toString();
  const nonce = Buffer.from(randomBytes(16)).toString('base64url');
  const canonical = buildCanonicalString(method, path, ts, nonce, body);
  const sig = signMessage(privateKey, new TextEncoder().encode(canonical));
  return buildAuthHeader({
    v: '1',
    id: publicKeyBase64,
    ts,
    nonce,
    sig: Buffer.from(sig).toString('base64url'),
  });
}

describe('middleware raw-body handling (M5)', () => {
  it('accepts a request when no parser runs (middleware buffers stream itself)', async () => {
    const body = '{"amount":100}';
    const auth = signRequest('POST', '/api', body);
    const res = await fetch(`${noParserUrl}/api`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body,
    });
    expect(res.status).toBe(200);
  });

  it('preserves byte-exact signature when body has non-canonical JSON whitespace', async () => {
    // A client that hand-writes JSON with extra whitespace. Under the pre-M5
    // fix, a parser running before the middleware would re-stringify this to
    // the compact form and produce a different hash — legitimate client,
    // failed auth. With the fix, the raw bytes are hashed as-is.
    const body = '{  "amount" :   100  }';
    const auth = signRequest('POST', '/api', body);
    const res = await fetch(`${noParserUrl}/api`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body,
    });
    expect(res.status).toBe(200);
  });

  it('returns 500 internal_error when req.body is a parsed object with no rawBody', async () => {
    // Under the pre-M5 fix, this would silently re-serialize via JSON.stringify
    // and verify against a mangled hash, breaking legitimate clients whose JSON
    // formatting differed from V8's. After the fix we refuse and return a 500
    // so the misconfiguration is visible instead of a mysterious auth failure.
    const body = '{"amount":100}';
    const auth = signRequest('POST', '/api', body);
    const res = await fetch(`${parsedObjectUrl}/api`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body,
    });
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('internal_error');
  });

  it('accepts a request when an upstream parser provides rawBody (recommended setup)', async () => {
    const body = '{"amount":100}';
    const auth = signRequest('POST', '/api', body);
    const res = await fetch(`${rawBodyUrl}/api`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body,
    });
    expect(res.status).toBe(200);
  });

  it('rejects request with body larger than maxBodyBytes', async () => {
    // tinyLimitServer uses maxBodyBytes=100; send 500 bytes.
    const bigBody = 'x'.repeat(500);
    const auth = signRequest('POST', '/api', bigBody);
    const res = await fetch(`${tinyLimitUrl}/api`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: bigBody,
    });
    expect(res.status).toBe(413);
  });

  it('accepts request with body exactly at maxBodyBytes', async () => {
    // 100 bytes exactly — boundary case, should be accepted.
    const body = 'x'.repeat(100);
    const auth = signRequest('POST', '/api', body);
    const res = await fetch(`${tinyLimitUrl}/api`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body,
    });
    expect(res.status).toBe(200);
  });
});
