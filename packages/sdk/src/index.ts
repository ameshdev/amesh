// Simple API (recommended)
export { amesh } from './amesh.js';
export { bootstrapIfNeeded } from './bootstrap.js';

// Advanced API (for custom setups)
export { AuthMeshClient } from './client.js';
export type { AuthMeshClientOptions } from './client.js';
export { authMeshVerify } from './middleware.js';
export type { VerifyOptions } from './middleware.js';
export { buildAuthHeader, parseAuthHeader } from './header.js';
export type { AuthMeshIdentity, AuthMeshHeader } from './types.js';
