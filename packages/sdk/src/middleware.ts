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

  return async (
    req: IncomingMessage & { body?: string | Buffer; authMesh?: AuthMeshIdentity },
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
      const body = getBody(req);

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

function sendError(res: ServerResponse, status: number, _code: string): void {
  // Per spec: 401 responses always return generic "unauthorized" to prevent oracle attacks
  // Exceptions: 400 errors return specific codes to aid debugging
  const body = status === 400 ? { error: _code } : { error: 'unauthorized' };
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function getBody(req: IncomingMessage & { body?: string | Buffer }): string {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf-8');
  return '';
}

function logServerSide(code: string, deviceId: string, serverNow: number, requestTs: number): void {
  // Server-side logging only — never exposed to client
  console.error(`[amesh] ${code}: device=${deviceId} serverNow=${serverNow} requestTs=${requestTs}`);
}
