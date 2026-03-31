import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

const PROTOCOL_VERSION = 'AMv1';

/**
 * Build the canonical string M for signing/verification.
 *
 * M = Version + "\n" + Method + "\n" + Path + "\n" + Timestamp + "\n" + Nonce + "\n" + BodyHash
 *
 * - Method is uppercased
 * - Path includes query string with params sorted alphabetically
 * - Timestamp is Unix seconds as string
 * - Nonce is Base64URL-encoded 16 random bytes
 * - BodyHash is hex-encoded SHA-256 of request body (or empty string)
 */
export function buildCanonicalString(
  method: string,
  path: string,
  timestamp: string,
  nonce: string,
  body: Uint8Array | string = '',
): string {
  // Validate fields cannot contain newlines (would inject extra canonical string fields)
  if (/\n/.test(timestamp) || /\n/.test(nonce) || /\n/.test(method) || /\n/.test(path)) {
    throw new Error('Canonical string fields must not contain newlines');
  }

  const normalizedMethod = method.toUpperCase();
  const normalizedPath = sortQueryParams(path);
  const bodyBytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
  const bodyHash = bytesToHex(sha256(bodyBytes));

  return [PROTOCOL_VERSION, normalizedMethod, normalizedPath, timestamp, nonce, bodyHash].join(
    '\n',
  );
}

function sortQueryParams(path: string): string {
  const qIndex = path.indexOf('?');
  if (qIndex === -1) return path;

  const basePath = path.slice(0, qIndex);
  const queryString = path.slice(qIndex + 1);
  const params = new URLSearchParams(queryString);
  params.sort();
  const sorted = params.toString();

  return sorted ? `${basePath}?${sorted}` : basePath;
}
