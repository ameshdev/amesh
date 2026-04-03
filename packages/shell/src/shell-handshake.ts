import { chacha20poly1305 } from '@noble/ciphers/chacha.js';
import { randomBytes } from '@noble/ciphers/utils.js';
import {
  generateEphemeralKeyPair,
  computeSharedSecret,
  deriveShellSessionKey,
  verifyMessage,
} from '@authmesh/core';
import type { AllowList } from '@authmesh/keystore';

interface PeerIdentity {
  publicKey: string; // base64
  deviceId: string;
  friendlyName: string;
  timestamp: string;
  selfSig: string; // base64
}

export interface ShellHandshakeResult {
  sessionKey: Uint8Array;
  peerDeviceId: string;
  peerFriendlyName: string;
  peerPublicKey: Uint8Array;
}

function send(ws: WebSocket, msg: object): void {
  ws.send(JSON.stringify(msg));
}

function createMessageReader(ws: WebSocket) {
  const queue: Record<string, unknown>[] = [];
  let waiter: { resolve: (msg: Record<string, unknown>) => void; reject: (err: Error) => void } | null = null;

  ws.addEventListener('message', (event: MessageEvent) => {
    const raw = typeof event.data === 'string' ? event.data : String(event.data);
    const msg = JSON.parse(raw);
    if (waiter) {
      const w = waiter;
      waiter = null;
      w.resolve(msg);
    } else {
      queue.push(msg);
    }
  });

  return {
    read(timeoutMs = 30_000): Promise<Record<string, unknown>> {
      if (queue.length > 0) return Promise.resolve(queue.shift()!);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiter = null;
          reject(new Error('Timeout waiting for message'));
        }, timeoutMs);
        waiter = {
          resolve: (msg) => { clearTimeout(timer); resolve(msg); },
          reject: (err) => { clearTimeout(timer); reject(err); },
        };
      });
    },
  };
}

function encrypt(sessionKey: Uint8Array, plaintext: Uint8Array): string {
  const nonce = randomBytes(12);
  const cipher = chacha20poly1305(sessionKey, nonce);
  const ciphertext = cipher.encrypt(plaintext);
  const combined = new Uint8Array(12 + ciphertext.length);
  combined.set(nonce, 0);
  combined.set(ciphertext, 12);
  return Buffer.from(combined).toString('base64');
}

function decrypt(sessionKey: Uint8Array, encoded: string): Uint8Array {
  const combined = Buffer.from(encoded, 'base64');
  const nonce = combined.subarray(0, 12);
  const ciphertext = combined.subarray(12);
  const cipher = chacha20poly1305(sessionKey, nonce);
  return cipher.decrypt(ciphertext);
}

function verifySelfSig(peer: PeerIdentity): boolean {
  const publicKey = new Uint8Array(Buffer.from(peer.publicKey, 'base64'));
  const message = new TextEncoder().encode(peer.publicKey + peer.friendlyName + peer.timestamp);
  const sig = new Uint8Array(Buffer.from(peer.selfSig, 'base64'));
  return verifyMessage(sig, message, publicKey);
}

/**
 * Run the TARGET (agent) side of the shell handshake.
 * No OTC, no SAS — trust is pre-established via allow list.
 * Returns the session key for encrypted shell I/O.
 */
export async function runAgentShellHandshake(
  ws: WebSocket,
  reader: ReturnType<typeof createMessageReader>,
  myDeviceId: string,
  myPublicKeyBase64: string,
  myFriendlyName: string,
  signFn: (message: Uint8Array) => Promise<Uint8Array>,
  allowList: AllowList,
): Promise<ShellHandshakeResult> {
  // Step 1: ECDH ephemeral exchange
  const ephemeral = generateEphemeralKeyPair();
  send(ws, { type: 'data', payload: Buffer.from(ephemeral.publicKey).toString('base64') });

  const peerEphMsg = await reader.read();
  const peerEphPub = new Uint8Array(Buffer.from(peerEphMsg.payload as string, 'base64'));

  // Step 2: Derive session key (BOUND to device IDs — separate domain from pairing)
  const sharedSecret = computeSharedSecret(ephemeral.privateKey, peerEphPub);

  // Step 3: Receive controller identity (encrypted with temp key for initial exchange)
  const tempKey = deriveShellSessionKey(sharedSecret, 'temp', 'temp');
  const encPeerIdentity = await reader.read();
  const peerIdentity = JSON.parse(
    new TextDecoder().decode(decrypt(tempKey, encPeerIdentity.payload as string)),
  ) as PeerIdentity;

  if (!verifySelfSig(peerIdentity)) {
    throw new Error('selfSig verification failed');
  }

  // Step 4: Authorization — check allow list
  const device = await allowList.findByPublicKey(peerIdentity.publicKey);
  if (!device) throw new Error('Device not in allow list');
  if (device.role !== 'controller') throw new Error('Device is not a controller');
  if (!device.permissions?.shell) throw new Error('Shell access not granted for this device');

  // Step 5: Send our identity
  const timestamp = new Date().toISOString();
  const selfSig = await signFn(
    new TextEncoder().encode(myPublicKeyBase64 + myFriendlyName + timestamp),
  );
  const myIdentity: PeerIdentity = {
    publicKey: myPublicKeyBase64,
    deviceId: myDeviceId,
    friendlyName: myFriendlyName,
    timestamp,
    selfSig: Buffer.from(selfSig).toString('base64'),
  };
  send(ws, { type: 'data', payload: encrypt(tempKey, new TextEncoder().encode(JSON.stringify(myIdentity))) });

  // Step 6: Derive final session key bound to actual device IDs
  const sessionKey = deriveShellSessionKey(sharedSecret, myDeviceId, peerIdentity.deviceId);

  return {
    sessionKey,
    peerDeviceId: peerIdentity.deviceId,
    peerFriendlyName: peerIdentity.friendlyName,
    peerPublicKey: new Uint8Array(Buffer.from(peerIdentity.publicKey, 'base64')),
  };
}

/**
 * Run the CONTROLLER side of the shell handshake.
 */
export async function runControllerShellHandshake(
  ws: WebSocket,
  reader: ReturnType<typeof createMessageReader>,
  myDeviceId: string,
  myPublicKeyBase64: string,
  myFriendlyName: string,
  signFn: (message: Uint8Array) => Promise<Uint8Array>,
  allowList: AllowList,
): Promise<ShellHandshakeResult> {
  // Step 1: Receive agent ephemeral key
  const peerEphMsg = await reader.read();
  const peerEphPub = new Uint8Array(Buffer.from(peerEphMsg.payload as string, 'base64'));

  // Send our ephemeral key
  const ephemeral = generateEphemeralKeyPair();
  send(ws, { type: 'data', payload: Buffer.from(ephemeral.publicKey).toString('base64') });

  // Step 2: Derive shared secret
  const sharedSecret = computeSharedSecret(ephemeral.privateKey, peerEphPub);
  const tempKey = deriveShellSessionKey(sharedSecret, 'temp', 'temp');

  // Step 3: Send our identity
  const timestamp = new Date().toISOString();
  const selfSig = await signFn(
    new TextEncoder().encode(myPublicKeyBase64 + myFriendlyName + timestamp),
  );
  const myIdentity: PeerIdentity = {
    publicKey: myPublicKeyBase64,
    deviceId: myDeviceId,
    friendlyName: myFriendlyName,
    timestamp,
    selfSig: Buffer.from(selfSig).toString('base64'),
  };
  send(ws, { type: 'data', payload: encrypt(tempKey, new TextEncoder().encode(JSON.stringify(myIdentity))) });

  // Step 4: Receive agent identity
  const encPeerIdentity = await reader.read();
  const peerIdentity = JSON.parse(
    new TextDecoder().decode(decrypt(tempKey, encPeerIdentity.payload as string)),
  ) as PeerIdentity;

  if (!verifySelfSig(peerIdentity)) {
    throw new Error('selfSig verification failed');
  }

  // Step 5: Verify agent is in our allow list
  const device = await allowList.findByPublicKey(peerIdentity.publicKey);
  if (!device) throw new Error('Device not in allow list');
  if (device.role !== 'target') throw new Error('Device is not a target');

  // Step 6: Derive final session key bound to actual device IDs
  const sessionKey = deriveShellSessionKey(sharedSecret, peerIdentity.deviceId, myDeviceId);

  return {
    sessionKey,
    peerDeviceId: peerIdentity.deviceId,
    peerFriendlyName: peerIdentity.friendlyName,
    peerPublicKey: new Uint8Array(Buffer.from(peerIdentity.publicKey, 'base64')),
  };
}

export { createMessageReader, send };
