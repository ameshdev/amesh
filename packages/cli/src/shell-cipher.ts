import { chacha20poly1305 } from '@noble/ciphers/chacha.js';

const NONCE_LEN = 12;

/**
 * Encrypted shell session cipher using ChaCha20-Poly1305 with incrementing nonces.
 *
 * Each side maintains its own send counter:
 *   - Controller starts at 0x00...00
 *   - Target starts at 0x80...00 (high bit set)
 *
 * This ensures the two sides never produce the same nonce, and provides
 * ordering guarantees. Nonce reuse with ChaCha20-Poly1305 is catastrophic
 * (XOR of ciphertexts leaks plaintext), so this design eliminates it.
 *
 * MUST NOT be confused with the random-nonce encrypt()/decrypt() in handshake.ts.
 * That code is for one-shot pairing messages. This is for long-lived shell sessions.
 */
export class ShellCipher {
  private readonly sessionKey: Uint8Array;
  private readonly sendNonce: Uint8Array;
  private readonly recvNonceStart: Uint8Array;
  private sendCounter: bigint;
  private recvCounter: bigint;
  private closed = false;

  /**
   * @param sessionKey - 32-byte key from deriveShellSessionKey()
   * @param role - 'controller' starts send nonce at 0x00, 'target' starts at 0x80
   */
  constructor(sessionKey: Uint8Array, role: 'controller' | 'target') {
    if (sessionKey.length !== 32) throw new Error('Session key must be 32 bytes');
    this.sessionKey = new Uint8Array(sessionKey);
    this.sendNonce = new Uint8Array(NONCE_LEN);
    this.recvNonceStart = new Uint8Array(NONCE_LEN);

    if (role === 'controller') {
      // Controller sends with nonces starting at 0x00..., receives 0x80...
      this.recvNonceStart[0] = 0x80;
    } else {
      // Target sends with nonces starting at 0x80..., receives 0x00...
      this.sendNonce[0] = 0x80;
    }

    this.sendCounter = 0n;
    this.recvCounter = 0n;
  }

  encrypt(plaintext: Uint8Array): Uint8Array {
    if (this.closed) throw new Error('Cipher is closed');
    const nonce = this.nextSendNonce();
    const cipher = chacha20poly1305(this.sessionKey, nonce);
    const ciphertext = cipher.encrypt(plaintext);
    // Prepend nonce so receiver can verify ordering
    const out = new Uint8Array(NONCE_LEN + ciphertext.length);
    out.set(nonce, 0);
    out.set(ciphertext, NONCE_LEN);
    return out;
  }

  decrypt(data: Uint8Array): Uint8Array {
    if (this.closed) throw new Error('Cipher is closed');
    if (data.length < NONCE_LEN + 16) throw new Error('Ciphertext too short'); // 16 = Poly1305 tag
    const nonce = data.subarray(0, NONCE_LEN);
    const ciphertext = data.subarray(NONCE_LEN);

    // Peek at expected nonce WITHOUT advancing the counter. Advancing before
    // authentication succeeds lets any injected/malformed frame permanently
    // desync the session — a one-packet DoS from an untrusted relay.
    const expected = this.peekRecvNonce();
    if (!constantTimeEqual(nonce, expected)) {
      throw new Error('Nonce mismatch — possible replay or out-of-order frame');
    }

    const cipher = chacha20poly1305(this.sessionKey, nonce);
    const plaintext = cipher.decrypt(ciphertext); // throws on Poly1305 auth failure
    // Only advance the receive counter after the frame is fully authenticated.
    this.recvCounter++;
    return plaintext;
  }

  close(): void {
    this.closed = true;
    this.sessionKey.fill(0);
    this.sendNonce.fill(0);
    this.recvNonceStart.fill(0);
  }

  private static readonly MAX_COUNTER = 2n ** 64n - 1n;

  private nextSendNonce(): Uint8Array {
    if (this.sendCounter >= ShellCipher.MAX_COUNTER) throw new Error('Nonce space exhausted');
    const nonce = new Uint8Array(this.sendNonce);
    this.incrementCounter(nonce, this.sendCounter);
    this.sendCounter++;
    return nonce;
  }

  /**
   * Compute the currently-expected receive nonce without mutating the counter.
   * The counter is advanced by decrypt() only after successful AEAD verification.
   */
  private peekRecvNonce(): Uint8Array {
    if (this.recvCounter >= ShellCipher.MAX_COUNTER) throw new Error('Nonce space exhausted');
    const nonce = new Uint8Array(this.recvNonceStart);
    this.incrementCounter(nonce, this.recvCounter);
    return nonce;
  }

  /**
   * Write counter into nonce bytes 4-11 (big-endian), preserving the role prefix in bytes 0-3.
   */
  private incrementCounter(nonce: Uint8Array, counter: bigint): void {
    const view = new DataView(nonce.buffer, nonce.byteOffset, nonce.byteLength);
    // Write 64-bit counter into bytes 4-11
    view.setBigUint64(4, counter, false); // big-endian
  }
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}
