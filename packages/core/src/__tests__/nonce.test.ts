import { describe, it, expect, afterEach } from 'vitest';
import { InMemoryNonceStore } from '../nonce.js';
import type { NonceStore } from '../nonce.js';

function testNonceStore(name: string, factory: () => NonceStore) {
  describe(name, () => {
    let store: NonceStore;

    afterEach(async () => {
      await store.close?.();
    });

    it('accepts a fresh nonce', async () => {
      store = factory();
      const result = await store.checkAndRecord('nonce_aaa', 60);
      expect(result).toBe(true);
    });

    it('rejects a replayed nonce immediately', async () => {
      store = factory();
      await store.checkAndRecord('nonce_bbb', 60);
      const result = await store.checkAndRecord('nonce_bbb', 60);
      expect(result).toBe(false);
    });

    it('accepts different nonces independently', async () => {
      store = factory();
      const r1 = await store.checkAndRecord('nonce_ccc', 60);
      const r2 = await store.checkAndRecord('nonce_ddd', 60);
      expect(r1).toBe(true);
      expect(r2).toBe(true);
    });

    it('accepts an expired nonce after TTL', async () => {
      store = factory();
      await store.checkAndRecord('nonce_eee', 1);
      await new Promise((r) => setTimeout(r, 2000));
      const result = await store.checkAndRecord('nonce_eee', 1);
      expect(result).toBe(true);
    }, 5000);

    it('handles concurrent requests for the same nonce', async () => {
      store = factory();
      const results = await Promise.all(
        Array.from({ length: 10 }, () => store.checkAndRecord('nonce_concurrent', 60)),
      );
      const accepted = results.filter((r) => r === true);
      const rejected = results.filter((r) => r === false);
      expect(accepted).toHaveLength(1);
      expect(rejected).toHaveLength(9);
    });

    it('handles high volume of unique nonces', async () => {
      store = factory();
      for (let i = 0; i < 1000; i++) {
        expect(await store.checkAndRecord(`nonce_${i}`, 60)).toBe(true);
      }
      // All replays rejected
      for (let i = 0; i < 1000; i++) {
        expect(await store.checkAndRecord(`nonce_${i}`, 60)).toBe(false);
      }
    });
  });
}

testNonceStore('InMemoryNonceStore', () => new InMemoryNonceStore());

describe('InMemoryNonceStore specifics', () => {
  it('tracks size correctly', async () => {
    const store = new InMemoryNonceStore();
    expect(store.size).toBe(0);
    await store.checkAndRecord('a', 60);
    expect(store.size).toBe(1);
    await store.checkAndRecord('b', 60);
    expect(store.size).toBe(2);
    await store.checkAndRecord('a', 60); // replay
    expect(store.size).toBe(2);
    await store.close();
  });

  it('close clears all entries', async () => {
    const store = new InMemoryNonceStore();
    await store.checkAndRecord('x', 60);
    expect(store.size).toBe(1);
    await store.close();
    expect(store.size).toBe(0);
  });
});
