import { buildCanonicalString, verifyMessage, InMemoryNonceStore } from '@authmesh/core';
import type { NonceStore } from '@authmesh/core';
import { AllowList } from '@authmesh/keystore';
import { parseAuthHeader } from './header.js';
import type { AuthMeshIdentity } from './types.js';
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface VerifyOptions {
  allowList: AllowList;
  clockSkewSeconds?: number;
  nonceWindowSeconds?: number;
  nonceStore?: NonceStore;
  /**
   * Maximum body size the middleware will buffer from the request stream
   * when no upstream parser has provided it. Defaults to 1 MiB. Requests
   * larger than this receive a 413. Set explicitly if your API accepts
   * large uploads and you've disabled upstream parsers.
   */
  maxBodyBytes?: number;
}

/**
 * Create an Express/Connect-compatible middleware that verifies AuthMesh signatures.
 *
 * Implements all 8 verification steps from the protocol spec:
 * 1. Parse header
 * 2. Version check
 * 3. Identity lookup (allow list)
 * 4. Clock check (±30s)
 * 5. Nonce check (replay prevention)
 * 6. Reconstruct canonical string
 * 7. Verify ECDSA-P256-SHA256 signature
 * 8. Attach verified identity to request
 */
export function authMeshVerify(opts: VerifyOptions) {
  const clockSkew = opts.clockSkewSeconds ?? 30;
  const nonceStore = opts.nonceStore ?? new InMemoryNonceStore();
  const maxBodyBytes = opts.maxBodyBytes ?? 1_048_576;

  return async (
    req: IncomingMessage & {
      body?: string | Buffer | object;
      rawBody?: Buffer | Uint8Array;
      authMesh?: AuthMeshIdentity;
    },
    res: ServerResponse,
    next: (err?: Error) => void,
  ) => {
    try {
      // Step 1 — Parse header
      const authHeader = req.headers['authorization'];
      const parsed = parseAuthHeader(authHeader);
      if (!parsed) {
        sendError(res, 400, authHeader ? 'malformed_header' : 'missing_header');
        return;
      }

      // Step 2 — Version check
      if (parsed.v !== '1') {
        sendError(res, 400, 'unsupported_version');
        return;
      }

      // Step 3 — Identity lookup
      const device = await opts.allowList.findByPublicKey(parsed.id);
      if (!device) {
        sendError(res, 401, 'unauthorized');
        return;
      }

      // Step 3b — Directionality check: targets cannot authenticate
      if (device.role === 'target') {
        sendError(res, 401, 'unauthorized');
        logServerSide('role_rejected', device.deviceId, Math.floor(Date.now() / 1000), 0);
        return;
      }

      // Step 4 — Clock check
      const serverNow = Math.floor(Date.now() / 1000);
      const requestTs = parseInt(parsed.ts, 10);
      if (isNaN(requestTs) || Math.abs(serverNow - requestTs) > clockSkew) {
        sendError(res, 401, 'unauthorized');
        logServerSide('timestamp_out_of_range', device.deviceId, serverNow, requestTs);
        return;
      }

      // Warn if clock skew approaching limit
      const skew = Math.abs(serverNow - requestTs);
      if (skew > clockSkew - 10) {
        logServerSide('clock_drift_warning', device.deviceId, serverNow, requestTs);
      }

      // Step 5 — Nonce check
      if (!(await nonceStore.checkAndRecord(parsed.nonce, opts.nonceWindowSeconds ?? 60))) {
        sendError(res, 401, 'unauthorized');
        logServerSide('replay_detected', device.deviceId, serverNow, requestTs);
        return;
      }

      // Step 6 — Reconstruct canonical string
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const method = req.method ?? 'GET';
      const path = url.pathname + url.search;

      // Hash the RAW request bytes. If an upstream parser has already run and
      // only left a parsed object behind (no rawBody), we refuse rather than
      // re-serialize — re-serialization is non-deterministic across parsers
      // and creates a latent signature-bypass / compatibility footgun (M5).
      let body: Uint8Array;
      try {
        body = await getRawBody(req, maxBodyBytes);
      } catch (err) {
        const msg = (err as Error).message;
        if (msg === 'body_parser_ordering_error') {
          console.error(
            '[amesh] CRITICAL: authMeshVerify saw a parsed req.body object with no req.rawBody. ' +
              'A body parser (e.g. express.json()) ran before authMeshVerify and consumed the ' +
              'raw bytes. Either mount authMeshVerify BEFORE body parsers, or configure your ' +
              'parser to expose rawBody (e.g. express.json({ verify: (req, _res, buf) => { (req as any).rawBody = buf; } })).',
          );
          sendError(res, 500, 'internal_error');
          return;
        }
        if (msg === 'payload_too_large') {
          sendError(res, 413, 'payload_too_large');
          return;
        }
        throw err;
      }

      const canonical = buildCanonicalString(method, path, parsed.ts, parsed.nonce, body);
      const message = new TextEncoder().encode(canonical);

      // Step 7 — Verify signature
      const signature = new Uint8Array(Buffer.from(parsed.sig, 'base64url'));
      // Support both base64 and base64url encoding for the id field
      const publicKey = new Uint8Array(Buffer.from(parsed.id, 'base64url'));

      if (!verifyMessage(signature, message, publicKey)) {
        sendError(res, 401, 'unauthorized');
        logServerSide('invalid_signature', device.deviceId, serverNow, requestTs);
        return;
      }

      // Step 8 — Attach identity to request
      req.authMesh = {
        deviceId: device.deviceId,
        friendlyName: device.friendlyName,
        verifiedAt: serverNow,
      };

      next();
    } catch (err) {
      // HMAC integrity failure on allow list read
      if (err instanceof Error && err.message.includes('integrity check failed')) {
        console.error('[amesh] CRITICAL: allow list integrity check failed — possible tampering');
        sendError(res, 500, 'internal_error');
        return;
      }
      next(err as Error);
    }
  };
}

function sendError(res: ServerResponse, status: number, code: string): void {
  // Per spec: 401 responses always return generic "unauthorized" to prevent
  // oracle attacks against the verification pipeline. 4xx errors outside
  // 401 and 5xx errors use the specific code — they describe client/server
  // misconfiguration, not verification state, so there's no oracle to leak.
  const body = status === 401 ? { error: 'unauthorized' } : { error: code };
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/**
 * Extract the RAW request body bytes for signature verification (M5).
 *
 * The protocol spec defines `BodyHash = SHA-256(request_body_bytes)` — the
 * exact bytes the client put on the wire. This middleware must hash those
 * same bytes, not a re-serialized projection.
 *
 * Supported sources, in priority order:
 *
 *   1. `req.rawBody` — if an upstream parser has saved the raw bytes via a
 *      `verify` hook (e.g. `express.json({ verify: (req, _res, buf) => { req.rawBody = buf } })`).
 *      This is the recommended pattern when a parser runs before us.
 *
 *   2. `req.body` as Buffer (e.g. `express.raw()`) — bytes are already raw.
 *
 *   3. `req.body` as string (e.g. `express.text()`) — encode as UTF-8.
 *      Note: this is only safe when the body truly is text. Operators using
 *      `express.text()` on non-text bodies will experience silent corruption.
 *
 *   4. No body parser has run — buffer the stream ourselves, then cache both
 *      `req.rawBody` and `req.body` so downstream middleware can read them.
 *
 * Throws `body_parser_ordering_error` when `req.body` is a parsed object
 * (e.g. `express.json()` without a `verify` hook) and no rawBody is present.
 * Previously this branch silently re-serialized with `JSON.stringify`, which
 * created compatibility and security footguns — two byte sequences that
 * parse to the same object would verify against the same signature.
 */
async function getRawBody(
  req: IncomingMessage & { body?: string | Buffer | object; rawBody?: Buffer | Uint8Array },
  maxBytes: number,
): Promise<Uint8Array> {
  // 1. rawBody set by upstream parser verify hook
  if (req.rawBody !== undefined) {
    if (Buffer.isBuffer(req.rawBody)) {
      return new Uint8Array(req.rawBody.buffer, req.rawBody.byteOffset, req.rawBody.byteLength);
    }
    return req.rawBody;
  }

  // 2. req.body as Buffer (express.raw())
  if (Buffer.isBuffer(req.body)) {
    return new Uint8Array(req.body.buffer, req.body.byteOffset, req.body.byteLength);
  }

  // 3. req.body as string (express.text())
  if (typeof req.body === 'string') {
    return new TextEncoder().encode(req.body);
  }

  // 4. req.body as parsed object with NO rawBody — refuse. A body parser ran
  //    before us and consumed the raw bytes; re-serializing the parsed object
  //    would hash something different from what the client signed.
  if (req.body !== null && req.body !== undefined && typeof req.body === 'object') {
    throw new Error('body_parser_ordering_error');
  }

  // 5. Nothing parsed yet — buffer the stream ourselves with a size cap.
  // If a Content-Length header is present and already exceeds maxBytes, we
  // reject before reading a single byte — avoids allocating a giant buffer
  // just to throw it away.
  const contentLength = req.headers['content-length'];
  if (contentLength !== undefined) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new Error('payload_too_large');
    }
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > maxBytes) {
      throw new Error('payload_too_large');
    }
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks);
  const rawBytes = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);

  // Cache both shapes for downstream middleware/handlers.
  (req as IncomingMessage & { body: string; rawBody: Buffer }).body = raw.toString('utf-8');
  (req as IncomingMessage & { rawBody: Buffer }).rawBody = raw;

  return rawBytes;
}

function logServerSide(code: string, deviceId: string, serverNow: number, requestTs: number): void {
  // Server-side logging only — never exposed to client
  console.error(
    `[amesh] ${code}: device=${deviceId} serverNow=${serverNow} requestTs=${requestTs}`,
  );
}
