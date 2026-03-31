import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { RedisNonceStore } from '../redis-nonce-store.js';

const REDIS_URL = process.env.REDIS_URL;

function uid() {
  return `nonce_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

describe.skipIf(!REDIS_URL)('RedisNonceStore', () => {
  let store: RedisNonceStore;

  beforeAll(() => {
    store = new RedisNonceStore({ redisUrl: REDIS_URL!, keyPrefix: 'test:am:nonce:' });
  });

  afterAll(async () => {
    await store.close();
  });
  it('accepts a fresh nonce', async () => {
    expect(await store.checkAndRecord(uid(), 60)).toBe(true);
  });

  it('rejects a replayed nonce', async () => {
    const nonce = uid();
    expect(await store.checkAndRecord(nonce, 60)).toBe(true);
    expect(await store.checkAndRecord(nonce, 60)).toBe(false);
  });

  it('accepts different nonces independently', async () => {
    expect(await store.checkAndRecord(uid(), 60)).toBe(true);
    expect(await store.checkAndRecord(uid(), 60)).toBe(true);
  });

  it('key expires after TTL', async () => {
    const nonce = uid();
    await store.checkAndRecord(nonce, 1);
    await new Promise((r) => setTimeout(r, 2000));
    expect(await store.checkAndRecord(nonce, 1)).toBe(true);
  }, 5000);

  it('handles 10 concurrent requests — exactly 1 wins', async () => {
    const nonce = uid();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => store.checkAndRecord(nonce, 60)),
    );
    expect(results.filter((r) => r === true)).toHaveLength(1);
    expect(results.filter((r) => r === false)).toHaveLength(9);
  });

  it('handles 100 unique nonces', async () => {
    const nonces = Array.from({ length: 100 }, () => uid());
    const results = await Promise.all(nonces.map((n) => store.checkAndRecord(n, 60)));
    expect(results.every((r) => r === true)).toBe(true);

    // All replays rejected
    const replays = await Promise.all(nonces.map((n) => store.checkAndRecord(n, 60)));
    expect(replays.every((r) => r === false)).toBe(true);
  });
});
