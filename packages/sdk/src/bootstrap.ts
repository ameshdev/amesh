import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { verifyMessage } from '@authmesh/core';
import { AllowList, detectAndCreate } from '@authmesh/keystore';

function getAmeshDir(): string {
  return process.env.AUTH_MESH_DIR ?? join(homedir(), '.amesh');
}

async function identityExists(): Promise<boolean> {
  try {
    await readFile(join(getAmeshDir(), 'identity.json'));
    return true;
  } catch {
    return false;
  }
}

interface BootstrapPayload {
  iss: string;
  pub?: string; // controller public key (base64, compressed P-256) — added in security hardening
  iat: number;
  exp: number;
  jti: string;
  name: string;
  relay: string;
  scope: string;
  single_use: boolean;
}

function decodeToken(token: string): { payload: BootstrapPayload; signatureInput: string; signature: Uint8Array } {
  const parts = token.replace(/^amesh-bt-v1\./, '').split('.');
  if (parts.length !== 3) throw new Error('invalid_token_format');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as BootstrapPayload;
  const signature = new Uint8Array(Buffer.from(parts[2], 'base64url'));
  return { payload, signatureInput: `${parts[0]}.${parts[1]}`, signature };
}

export interface BootstrapOptions {
  timeoutSeconds?: number;
}

/**
 * Auto-bootstrap if AMESH_BOOTSTRAP_TOKEN is set and no identity exists.
 *
 * Usage:
 *   import { bootstrapIfNeeded } from '@authmesh/sdk';
 *   await bootstrapIfNeeded();
 */
export async function bootstrapIfNeeded(opts?: BootstrapOptions): Promise<void> {
  const token = process.env.AMESH_BOOTSTRAP_TOKEN;
  const hasIdentity = await identityExists();

  if (!token && hasIdentity) return; // ready
  if (token && hasIdentity) {
    console.warn('[amesh] AMESH_BOOTSTRAP_TOKEN is set but identity already exists. Ignoring token.');
    return;
  }
  if (!token && !hasIdentity) {
    throw new Error(
      'No amesh identity found and no AMESH_BOOTSTRAP_TOKEN set.\n' +
      'Run `amesh init` on this machine or set AMESH_BOOTSTRAP_TOKEN.',
    );
  }

  // Token present, no identity — run bootstrap
  const { payload, signatureInput, signature } = decodeToken(token!);

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) throw new Error('token_expired');

  // Generate our identity
  const ameshDir = getAmeshDir();
  const keysDir = join(ameshDir, 'keys');
  const { backend, keyStore } = await detectAndCreate(keysDir);

  const { publicKey } = await keyStore.generateAndStore('am_pending');

  // Connect to relay and run bootstrap handshake
  const { WebSocket } = await import('ws');
  const ws = new WebSocket(payload.relay);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => { ws.close(); reject(new Error('bootstrap_timeout')); },
      (opts?.timeoutSeconds ?? 30) * 1000,
    );

    ws.on('open', () => {
      // Send bootstrap init
      ws.send(JSON.stringify({
        type: 'bootstrap_init',
        jti: payload.jti,
        token: token,
        targetPubKey: Buffer.from(publicKey).toString('base64'),
      }));
    });

    ws.on('message', async (raw: Buffer) => {
      clearTimeout(timeout);
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === 'bootstrap_reject') {
          ws.close();
          reject(new Error(msg.error ?? 'bootstrap_rejected'));
          return;
        }

        if (msg.type === 'bootstrap_ack') {
          // Use controller's public key embedded in the token (trusted),
          // NOT the key from the relay message (untrusted).
          if (!payload.pub) {
            ws.close();
            reject(new Error('token_missing_controller_pubkey'));
            return;
          }
          const controllerPubKey = new Uint8Array(Buffer.from(payload.pub, 'base64'));

          // Verify token signature with the embedded controller public key
          const sigInput = new TextEncoder().encode(signatureInput);
          if (!verifyMessage(signature, sigInput, controllerPubKey)) {
            ws.close();
            reject(new Error('invalid_token_signature'));
            return;
          }

          // Verify relay-provided key matches the token-embedded key
          if (msg.controllerPubKey) {
            const relayPubKey = new Uint8Array(Buffer.from(msg.controllerPubKey, 'base64'));
            if (Buffer.from(controllerPubKey).toString('base64') !== Buffer.from(relayPubKey).toString('base64')) {
              ws.close();
              reject(new Error('controller_pubkey_mismatch'));
              return;
            }
          }

          // Verify controller's ack signature
          const ackMsg = new TextEncoder().encode(
            Buffer.from(publicKey).toString('base64') + payload.jti,
          );
          const ackSig = new Uint8Array(Buffer.from(msg.controllerSig, 'base64'));
          if (!verifyMessage(ackSig, ackMsg, controllerPubKey)) {
            ws.close();
            reject(new Error('invalid_controller_signature'));
            return;
          }

          // Write identity
          const { sha256 } = await import('@noble/hashes/sha2.js');
          const deviceId = `am_${Buffer.from(sha256(publicKey)).toString('base64url').slice(0, 16)}`;

          // Hardware keystores can't rename keys. Store a keyAlias mapping
          // so the real deviceId maps to the 'am_pending' key in hardware.

          // Write identity.json
          const { writeFile, mkdir } = await import('node:fs/promises');
          const { dirname } = await import('node:path');
          const identityPath = join(ameshDir, 'identity.json');
          await mkdir(dirname(identityPath), { recursive: true, mode: 0o700 });
          const identityData = {
            version: '2.0.0',
            deviceId,
            keyAlias: 'am_pending',
            publicKey: Buffer.from(publicKey).toString('base64'),
            friendlyName: payload.name,
            createdAt: new Date().toISOString(),
            storageBackend: backend,
          };
          await writeFile(identityPath, JSON.stringify(identityData, null, 2), { mode: 0o600 });

          // Write allow list with controller
          const hmacKey = await keyStore.getHmacKeyMaterial('am_pending');
          const allowList = new AllowList(join(ameshDir, 'allow_list.json'), hmacKey, deviceId);
          await allowList.addDevice({
            deviceId: payload.iss,
            publicKey: Buffer.from(controllerPubKey).toString('base64'),
            friendlyName: 'controller',
            addedAt: new Date().toISOString(),
            addedBy: 'handshake',
            role: 'controller',
          });

          // Clear token from environment
          delete process.env.AMESH_BOOTSTRAP_TOKEN;

          ws.close();
          resolve();
        }
      } catch (err) {
        ws.close();
        reject(err);
      }
    });

    ws.on('error', (err: Error) => { clearTimeout(timeout); reject(err); });
  });
}
