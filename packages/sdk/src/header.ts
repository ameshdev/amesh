import type { AuthMeshHeader } from './types.js';

/**
 * Maximum total length of an Authorization header value we will parse.
 * A well-formed header is ~250 bytes; anything larger is either
 * adversarial padding or a misuse. Reject early to bound parser work.
 */
const MAX_HEADER_LENGTH = 1024;

/**
 * Per-field length caps. v/ts are small integers; id/nonce/sig are
 * base64/base64url with known maximum sizes (33-byte compressed P-256 pub =
 * 44-char base64, 16-byte nonce = 22-char base64url, 64-byte sig = 86-char
 * base64url). Caps are generous multiples to allow for url-safe variants,
 * padding, and future version bumps, while still bounding memory.
 */
const MAX_FIELD_LENGTHS: Record<string, number> = {
  v: 8,
  id: 128,
  ts: 16,
  nonce: 64,
  sig: 256,
};

const EXPECTED_KEYS = new Set(['v', 'id', 'ts', 'nonce', 'sig']);

/**
 * Build the Authorization header value.
 * Format: AuthMesh v="1",id="...",ts="...",nonce="...",sig="..."
 */
export function buildAuthHeader(parts: AuthMeshHeader): string {
  return `AuthMesh v="${parts.v}",id="${parts.id}",ts="${parts.ts}",nonce="${parts.nonce}",sig="${parts.sig}"`;
}

/**
 * Parse the Authorization header value.
 * Returns null if the header is missing, malformed, or not an AuthMesh header.
 *
 * L2 hardening:
 *   - Rejects headers longer than MAX_HEADER_LENGTH to bound parser work.
 *   - Rejects any field longer than its MAX_FIELD_LENGTHS entry.
 *   - Rejects duplicate keys (e.g. `v="1",v="2"`) rather than silently
 *     keeping the last one, which used to allow an attacker to smuggle
 *     confusing fields past naive log scrapers or custom handlers.
 *   - Rejects any unknown key so future versions can't introduce
 *     ambiguous keys into clients that don't understand them.
 */
export function parseAuthHeader(header: string | undefined): AuthMeshHeader | null {
  if (!header || !header.startsWith('AuthMesh ')) return null;
  if (header.length > MAX_HEADER_LENGTH) return null;

  const params = header.slice('AuthMesh '.length);
  const parts: Record<string, string> = {};
  const seen = new Set<string>();

  // Parse key="value" pairs
  const regex = /(\w+)="([^"]*)"/g;
  let match;
  while ((match = regex.exec(params)) !== null) {
    const key = match[1];
    const value = match[2];

    // Duplicate keys are rejected — they enable header-confusion tricks.
    if (seen.has(key)) return null;
    seen.add(key);

    // Reject unknown keys to fail closed on future spec additions.
    if (!EXPECTED_KEYS.has(key)) return null;

    // Enforce per-field length cap.
    const cap = MAX_FIELD_LENGTHS[key];
    if (value.length > cap) return null;

    parts[key] = value;
  }

  if (!parts.v || !parts.id || !parts.ts || !parts.nonce || !parts.sig) {
    return null;
  }

  return {
    v: parts.v,
    id: parts.id,
    ts: parts.ts,
    nonce: parts.nonce,
    sig: parts.sig,
  };
}
