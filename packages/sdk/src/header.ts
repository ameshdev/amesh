import type { AuthMeshHeader } from './types.js';

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
 */
export function parseAuthHeader(header: string | undefined): AuthMeshHeader | null {
  if (!header || !header.startsWith('AuthMesh ')) return null;

  const params = header.slice('AuthMesh '.length);
  const parts: Record<string, string> = {};

  // Parse key="value" pairs
  const regex = /(\w+)="([^"]*)"/g;
  let match;
  while ((match = regex.exec(params)) !== null) {
    parts[match[1]] = match[2];
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
