import { describe, it, expect } from 'bun:test';
import { ShellCipher } from '../shell-cipher.js';
import { randomBytes } from '@noble/ciphers/utils.js';

const sessionKey = randomBytes(32);

describe('ShellCipher', () => {
  it('encrypts and decrypts a message (controller → target)', () => {
    const controller = new ShellCipher(sessionKey, 'controller');
    const target = new ShellCipher(sessionKey, 'target');

    const plaintext = new TextEncoder().encode('hello world');
    const encrypted = controller.encrypt(plaintext);
    const decrypted = target.decrypt(encrypted);

    expect(new TextDecoder().decode(decrypted)).toBe('hello world');

    controller.close();
    target.close();
  });

  it('encrypts and decrypts a message (target → controller)', () => {
    const controller = new ShellCipher(sessionKey, 'controller');
    const target = new ShellCipher(sessionKey, 'target');

    const plaintext = new TextEncoder().encode('response data');
    const encrypted = target.encrypt(plaintext);
    const decrypted = controller.decrypt(encrypted);

    expect(new TextDecoder().decode(decrypted)).toBe('response data');

    controller.close();
    target.close();
  });

  it('handles multiple messages in sequence', () => {
    const controller = new ShellCipher(sessionKey, 'controller');
    const target = new ShellCipher(sessionKey, 'target');

    for (let i = 0; i < 100; i++) {
      const msg = new TextEncoder().encode(`message ${i}`);
      const encrypted = controller.encrypt(msg);
      const decrypted = target.decrypt(encrypted);
      expect(new TextDecoder().decode(decrypted)).toBe(`message ${i}`);
    }

    controller.close();
    target.close();
  });

  it('rejects out-of-order nonces', () => {
    const controller = new ShellCipher(sessionKey, 'controller');
    const target = new ShellCipher(sessionKey, 'target');

    const msg1 = controller.encrypt(new TextEncoder().encode('first'));
    controller.encrypt(new TextEncoder().encode('second')); // advance counter

    // Consume first, then replay it — should fail
    target.decrypt(msg1);
    expect(() => target.decrypt(msg1)).toThrow('Nonce mismatch');

    controller.close();
    target.close();
  });

  it('rejects decryption with wrong key', () => {
    const key2 = randomBytes(32);
    const controller = new ShellCipher(sessionKey, 'controller');
    const wrongTarget = new ShellCipher(key2, 'target');

    const encrypted = controller.encrypt(new TextEncoder().encode('secret'));
    expect(() => wrongTarget.decrypt(encrypted)).toThrow();

    controller.close();
    wrongTarget.close();
  });

  it('refuses operations after close', () => {
    const cipher = new ShellCipher(sessionKey, 'controller');
    cipher.close();

    expect(() => cipher.encrypt(new Uint8Array(1))).toThrow('Cipher is closed');
  });

  it('rejects session key of wrong length', () => {
    expect(() => new ShellCipher(new Uint8Array(16), 'controller')).toThrow('Session key must be 32 bytes');
  });

  it('controller and target nonces do not overlap', () => {
    const controller = new ShellCipher(sessionKey, 'controller');
    const target = new ShellCipher(sessionKey, 'target');

    // Both encrypt — the nonces should be different (high bit split)
    const enc1 = controller.encrypt(new TextEncoder().encode('a'));
    const enc2 = target.encrypt(new TextEncoder().encode('b'));

    // First byte of nonce: controller=0x00, target=0x80
    expect(enc1[0]).toBe(0x00);
    expect(enc2[0]).toBe(0x80);

    controller.close();
    target.close();
  });
});
