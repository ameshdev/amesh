import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { buildCanonicalString, verifyMessage, InMemoryNonceStore } from '@authmesh/core';
import type { NonceStore } from '@authmesh/core';
import { AllowList, createForBackend } from '@authmesh/keystore';
import type { StorageBackend } from '@authmesh/keystore';
import { randomBytes } from '@noble/ciphers/utils.js';
import { parseAuthHeader } from './header.js';
import { buildAuthHeader } from './header.js';
import type { AuthMeshIdentity } from './types.js';
import type { IncomingMessage, ServerResponse } from 'node:http';

interface Identity {
  deviceId: string;
  keyAlias?: string;
  publicKey: string;
  friendlyName: string;
  storageBackend: string;
  passphrase?: string;
}

function getAmeshDir(): string {
  return process.env.AUTH_MESH_DIR ?? join(homedir(), '.amesh');
}

let cachedIdentity: Identity | null = null;
let cachedPassphrase: string | undefined;

async function loadIdentity(): Promise<Identity> {
  if (cachedIdentity) return cachedIdentity;
  const content = await readFile(join(getAmeshDir(), 'identity.json'), 'utf-8');
  const identity = JSON.parse(content) as Identity;
  cachedPassphrase = identity.passphrase ?? process.env.AUTH_MESH_PASSPHRASE;
  delete identity.passphrase;
  cachedIdentity = identity;
  return cachedIdentity;
}

/**
 * Drop-in replacement for fetch() that signs requests with your amesh identity.
 *
 * Usage:
 *   import { amesh } from '@authmesh/sdk';
 *   const res = await amesh.fetch('https://api.example.com/data', { method: 'POST', body: '{}' });
 */
async function ameshFetch(url: string | URL, init?: RequestInit): Promise<Response> {
  const identity = await loadIdentity();
  const keyStore = await createForBackend(
    identity.storageBackend as StorageBackend,
    join(getAmeshDir(), 'keys'),
    cachedPassphrase,
  );

  const keyAlias = identity.keyAlias ?? identity.deviceId;
  const parsedUrl = new URL(url);
  const method = (init?.method ?? 'GET').toUpperCase();
  const body = init?.body ? String(init.body) : '';
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = Buffer.from(randomBytes(16)).toString('base64url');
  const path = parsedUrl.pathname + parsedUrl.search;

  const canonical = buildCanonicalString(method, path, timestamp, nonce, body);
  const sig = await keyStore.sign(keyAlias, new TextEncoder().encode(canonical));

  const headers = new Headers(init?.headers);
  headers.set(
    'Authorization',
    buildAuthHeader({
      v: '1',
      id: identity.publicKey,
      ts: timestamp,
      nonce,
      sig: Buffer.from(sig).toString('base64url'),
    }),
  );

  return globalThis.fetch(url, { ...init, headers });
}

/**
 * Express/Connect middleware that verifies amesh signatures.
 * Auto-loads allow list from ~/.amesh/allow_list.json.
 *
 * Usage:
 *   import { amesh } from '@authmesh/sdk';
 *   app.use(amesh.verify());
 */
function ameshVerify(opts?: {
  clockSkewSeconds?: number;
  nonceWindowSeconds?: number;
  nonceStore?: NonceStore;
}) {
  const clockSkew = opts?.clockSkewSeconds ?? 30;
  const nonceWindowSeconds = opts?.nonceWindowSeconds ?? 60;
  const nonceStore = opts?.nonceStore ?? new InMemoryNonceStore();

  if (!opts?.nonceStore && process.env.NODE_ENV === 'production') {
    console.warn(
      '[amesh] WARNING: Using in-memory nonce store. Replay protection will not work across multiple instances.\n' +
        '  Provide a RedisNonceStore for production multi-instance deployments.',
    );
  }
  let allowList: AllowList | null = null;

  async function getAllowList(): Promise<AllowList> {
    if (allowList) return allowList;
    const identity = await loadIdentity();
    const keyStore = await createForBackend(
      identity.storageBackend as StorageBackend,
      join(getAmeshDir(), 'keys'),
      cachedPassphrase,
    );
    const keyAlias = identity.keyAlias ?? identity.deviceId;
    const hmacKey = await keyStore.getHmacKeyMaterial(keyAlias);
    allowList = new AllowList(join(getAmeshDir(), 'allow_list.json'), hmacKey, identity.deviceId);
    return allowList;
  }

  return async (
    req: IncomingMessage & { body?: string | Buffer; authMesh?: AuthMeshIdentity },
    res: ServerResponse,
    next: (err?: Error) => void,
  ) => {
    try {
      const parsed = parseAuthHeader(req.headers['authorization']);
      if (!parsed) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: req.headers['authorization'] ? 'malformed_header' : 'missing_header',
          }),
        );
        return;
      }

      if (parsed.v !== '1') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'unsupported_version' }));
        return;
      }

      const al = await getAllowList();
      const device = await al.findByPublicKey(parsed.id);
      if (!device) {
        sendUnauthorized(res);
        return;
      }

      // Directionality check: targets cannot authenticate
      if (device.role === 'target') {
        sendUnauthorized(res);
        return;
      }

      const serverNow = Math.floor(Date.now() / 1000);
      const requestTs = parseInt(parsed.ts, 10);
      if (isNaN(requestTs) || Math.abs(serverNow - requestTs) > clockSkew) {
        sendUnauthorized(res);
        return;
      }

      if (!(await nonceStore.checkAndRecord(parsed.nonce, nonceWindowSeconds))) {
        sendUnauthorized(res);
        return;
      }

      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const body = await getBody(req);
      const canonical = buildCanonicalString(
        req.method ?? 'GET',
        url.pathname + url.search,
        parsed.ts,
        parsed.nonce,
        body,
      );
      const signature = new Uint8Array(Buffer.from(parsed.sig, 'base64url'));
      const publicKey = new Uint8Array(Buffer.from(parsed.id, 'base64url'));

      if (!verifyMessage(signature, new TextEncoder().encode(canonical), publicKey)) {
        sendUnauthorized(res);
        return;
      }

      req.authMesh = {
        deviceId: device.deviceId,
        friendlyName: device.friendlyName,
        verifiedAt: serverNow,
      };
      next();
    } catch (err) {
      if (err instanceof Error && err.message.includes('integrity check failed')) {
        console.error('[amesh] CRITICAL: allow list integrity check failed — possible tampering');
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'internal_error' }));
        return;
      }
      next(err as Error);
    }
  };
}

/**
 * Extract the request body as a string for signature verification.
 * Handles: express.text() (string), express.raw() (Buffer), express.json() (object),
 * and no body parser (buffers from stream).
 */
async function getBody(
  req: IncomingMessage & { body?: string | Buffer | object },
): Promise<string> {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf-8');
  if (req.body !== null && req.body !== undefined && typeof req.body === 'object') {
    return JSON.stringify(req.body);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf-8');
  (req as IncomingMessage & { body: string }).body = raw;
  return raw;
}

function sendUnauthorized(res: ServerResponse) {
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'unauthorized' }));
}

export const amesh = {
  fetch: ameshFetch,
  verify: ameshVerify,
};
