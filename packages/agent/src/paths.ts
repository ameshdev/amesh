import { homedir } from 'node:os';
import { join } from 'node:path';

const AUTH_MESH_DIR = join(homedir(), '.amesh');

export function getAuthMeshDir(): string {
  return process.env.AUTH_MESH_DIR ?? AUTH_MESH_DIR;
}

export function getIdentityPath(): string {
  return join(getAuthMeshDir(), 'identity.json');
}

export function getAllowListPath(): string {
  return join(getAuthMeshDir(), 'allow_list.json');
}

export function getKeysDir(): string {
  return join(getAuthMeshDir(), 'keys');
}
