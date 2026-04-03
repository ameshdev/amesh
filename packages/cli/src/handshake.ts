import { sha256 } from '@noble/hashes/sha2.js';
import { chacha20poly1305 } from '@noble/ciphers/chacha.js';
import { randomBytes } from '@noble/ciphers/utils.js';
import {
  generateEphemeralKeyPair,
  computeSharedSecret,
  deriveSessionKey,
  verifyMessage,
} from '@authmesh/core';

interface PeerIdentity {
  publicKey: string; // base64
  friendlyName: string;
  timestamp: string;
  selfSig: string; // base64
}

/**
 * Send a JSON message over WebSocket.
 */
function send(ws: WebSocket, msg: object): void {
  ws.send(JSON.stringify(msg));
}

/**
 * Create a buffered message reader for a WebSocket.
 * Messages that arrive before read() is called are queued.
 * Uses the standard WebSocket API (works in Bun and browsers).
 */
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
      if (queue.length > 0) {
        return Promise.resolve(queue.shift()!);
      }
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

/**
 * Encrypt a message with ChaCha20-Poly1305.
 */
function encrypt(sessionKey: Uint8Array, plaintext: Uint8Array): string {
  const nonce = randomBytes(12);
  const cipher = chacha20poly1305(sessionKey, nonce);
  const ciphertext = cipher.encrypt(plaintext);
  // Prepend nonce to ciphertext
  const combined = new Uint8Array(12 + ciphertext.length);
  combined.set(nonce, 0);
  combined.set(ciphertext, 12);
  return Buffer.from(combined).toString('base64');
}

/**
 * Decrypt a message with ChaCha20-Poly1305.
 */
function decrypt(sessionKey: Uint8Array, encoded: string): Uint8Array {
  const combined = Buffer.from(encoded, 'base64');
  const nonce = combined.subarray(0, 12);
  const ciphertext = combined.subarray(12);
  const cipher = chacha20poly1305(sessionKey, nonce);
  return cipher.decrypt(ciphertext);
}

/**
 * Compute SAS (Short Authentication String) for MITM detection.
 * SAS = truncate(SHA-256(targetPub || controllerPub || sharedSecret), 6 digits)
 */
export function computeSAS(
  targetPubKey: Uint8Array,
  controllerPubKey: Uint8Array,
  sharedSecret: Uint8Array,
): string {
  const combined = new Uint8Array(targetPubKey.length + controllerPubKey.length + sharedSecret.length);
  combined.set(targetPubKey, 0);
  combined.set(controllerPubKey, targetPubKey.length);
  combined.set(sharedSecret, targetPubKey.length + controllerPubKey.length);
  const hash = sha256(combined);
  const num = ((hash[0] << 16) | (hash[1] << 8) | hash[2]) % 1_000_000;
  return num.toString().padStart(6, '0');
}

/**
 * Generate a 6-digit OTC.
 */
export function generateOTC(): string {
  const bytes = randomBytes(4);
  const num = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  return ((num % 900_000) + 100_000).toString();
}

/**
 * Verify selfSig from a peer.
 */
function verifySelfSig(peer: PeerIdentity): boolean {
  const publicKey = new Uint8Array(Buffer.from(peer.publicKey, 'base64'));
  const message = new TextEncoder().encode(peer.publicKey + peer.friendlyName + peer.timestamp);
  const sig = new Uint8Array(Buffer.from(peer.selfSig, 'base64'));
  return verifyMessage(sig, message, publicKey);
}

/**
 * Constant-time comparison for SAS codes.
 * Prevents timing side-channels during code entry verification.
 */
export function verifySAS(entered: string, computed: string): boolean {
  if (entered.length !== computed.length) return false;
  let diff = 0;
  for (let i = 0; i < entered.length; i++) {
    diff |= entered.charCodeAt(i) ^ computed.charCodeAt(i);
  }
  return diff === 0;
}

export interface HandshakeResult {
  peerPublicKey: Uint8Array;
  peerFriendlyName: string;
  sas: string;
}

/**
 * Run the TARGET side of the handshake (Step 1-11 from spec).
 */
export async function runTargetHandshake(
  relayUrl: string,
  otc: string,
  myPublicKeyBase64: string,
  myFriendlyName: string,
  signFn: (message: Uint8Array) => Promise<Uint8Array>,
): Promise<HandshakeResult> {
  const ws = new WebSocket(relayUrl);
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', (e) => reject(e));
  });
  const reader = createMessageReader(ws);

  try {
    // Step 1: Connect with OTC
    send(ws, { type: 'listen', otc });
    const ack = await reader.read();
    if (ack.type === 'error') throw new Error(`Relay error: ${ack.code}`);

    // Step 2-4: Wait for controller
    const peerFound = await reader.read(60_000);
    if (peerFound.type !== 'peer_found') throw new Error(`Unexpected: ${peerFound.type}`);

    // Step 5: ECDH ephemeral exchange — send our ephemeral public key
    const ephemeral = generateEphemeralKeyPair();
    send(ws, { type: 'data', payload: Buffer.from(ephemeral.publicKey).toString('base64') });

    // Receive controller's ephemeral public key
    const peerEphMsg = await reader.read();
    const peerEphPub = new Uint8Array(Buffer.from(peerEphMsg.payload as string, 'base64'));

    // Step 6: Derive session key
    const sharedSecret = computeSharedSecret(ephemeral.privateKey, peerEphPub);
    const sessionKey = deriveSessionKey(sharedSecret);

    // Step 7: Receive controller's permanent identity (encrypted)
    const encPeerIdentity = await reader.read();
    const peerIdentity = JSON.parse(
      new TextDecoder().decode(decrypt(sessionKey, encPeerIdentity.payload as string)),
    ) as PeerIdentity;

    if (!verifySelfSig(peerIdentity)) {
      throw new Error('selfSig verification failed — peer identity is invalid');
    }

    // Step 8: Send our permanent identity (encrypted)
    const timestamp = new Date().toISOString();
    const selfSig = await signFn(
      new TextEncoder().encode(myPublicKeyBase64 + myFriendlyName + timestamp),
    );

    const myIdentity: PeerIdentity = {
      publicKey: myPublicKeyBase64,
      friendlyName: myFriendlyName,
      timestamp,
      selfSig: Buffer.from(selfSig).toString('base64'),
    };

    const encMyIdentity = encrypt(sessionKey, new TextEncoder().encode(JSON.stringify(myIdentity)));
    send(ws, { type: 'data', payload: encMyIdentity });

    // Step 9: Compute SAS
    const myPub = new Uint8Array(Buffer.from(myPublicKeyBase64, 'base64'));
    const peerPub = new Uint8Array(Buffer.from(peerIdentity.publicKey, 'base64'));
    const sas = computeSAS(myPub, peerPub, sharedSecret);

    // Step 10: Done
    send(ws, { type: 'done' });

    return {
      peerPublicKey: peerPub,
      peerFriendlyName: peerIdentity.friendlyName,
      sas,
    };
  } finally {
    ws.close();
  }
}

/**
 * Run the CONTROLLER side of the handshake.
 */
export async function runControllerHandshake(
  relayUrl: string,
  otc: string,
  myPublicKeyBase64: string,
  myFriendlyName: string,
  signFn: (message: Uint8Array) => Promise<Uint8Array>,
): Promise<HandshakeResult> {
  const ws = new WebSocket(relayUrl);
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', (e) => reject(e));
  });
  const reader = createMessageReader(ws);

  try {
    // Step 3: Connect with OTC
    send(ws, { type: 'connect', otc });
    const peerFound = await reader.read();
    if (peerFound.type === 'error') throw new Error(`Relay error: ${peerFound.code}`);
    if (peerFound.type !== 'peer_found') throw new Error(`Unexpected: ${peerFound.type}`);

    // Step 5: Receive target's ephemeral public key
    const peerEphMsg = await reader.read();
    const peerEphPub = new Uint8Array(Buffer.from(peerEphMsg.payload as string, 'base64'));

    // Send our ephemeral public key
    const ephemeral = generateEphemeralKeyPair();
    send(ws, { type: 'data', payload: Buffer.from(ephemeral.publicKey).toString('base64') });

    // Step 6: Derive session key
    const sharedSecret = computeSharedSecret(ephemeral.privateKey, peerEphPub);
    const sessionKey = deriveSessionKey(sharedSecret);

    // Step 7: Send our permanent identity (encrypted)
    const timestamp = new Date().toISOString();
    const selfSig = await signFn(
      new TextEncoder().encode(myPublicKeyBase64 + myFriendlyName + timestamp),
    );

    const myIdentity: PeerIdentity = {
      publicKey: myPublicKeyBase64,
      friendlyName: myFriendlyName,
      timestamp,
      selfSig: Buffer.from(selfSig).toString('base64'),
    };

    const encMyIdentity = encrypt(sessionKey, new TextEncoder().encode(JSON.stringify(myIdentity)));
    send(ws, { type: 'data', payload: encMyIdentity });

    // Step 8: Receive target's permanent identity (encrypted)
    const encPeerIdentity = await reader.read();
    const peerIdentity = JSON.parse(
      new TextDecoder().decode(decrypt(sessionKey, encPeerIdentity.payload as string)),
    ) as PeerIdentity;

    if (!verifySelfSig(peerIdentity)) {
      throw new Error('selfSig verification failed — peer identity is invalid');
    }

    // Step 9: Compute SAS
    const peerPub = new Uint8Array(Buffer.from(peerIdentity.publicKey, 'base64'));
    const myPub = new Uint8Array(Buffer.from(myPublicKeyBase64, 'base64'));
    const sas = computeSAS(peerPub, myPub, sharedSecret);

    // Step 10: Done
    send(ws, { type: 'done' });

    return {
      peerPublicKey: peerPub,
      peerFriendlyName: peerIdentity.friendlyName,
      sas,
    };
  } finally {
    ws.close();
  }
}
