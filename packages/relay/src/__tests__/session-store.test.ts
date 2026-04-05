import { describe, it, expect } from 'bun:test';
import { SessionStore } from '../session.js';
import type { ServerWebSocket } from 'bun';
import type { WebSocketData } from '../server.js';

/**
 * Regression test for M2 — SessionStore had no upper bound on concurrent
 * pairing sessions, so an attacker could flood `listen` messages until the
 * relay OOM'd. The fix caps the store at `maxSessions` (default 50k) and
 * throws a distinct `session_store_full` error that handleListen surfaces
 * as `relay_capacity` (vs `otc_in_use` for collisions).
 */
describe('SessionStore cap (M2)', () => {
  // Cast a minimal object to the ServerWebSocket type — SessionStore never
  // actually invokes anything on it, so this is safe for testing capacity.
  const fakeWs = {} as ServerWebSocket<WebSocketData>;

  it('accepts sessions up to maxSessions', () => {
    const store = new SessionStore(5);
    for (let i = 0; i < 5; i++) {
      store.create(`${100000 + i}`, fakeWs, 60);
    }
    expect(store.size).toBe(5);
  });

  it('throws session_store_full when capacity is exceeded', () => {
    const store = new SessionStore(3);
    store.create('100001', fakeWs, 60);
    store.create('100002', fakeWs, 60);
    store.create('100003', fakeWs, 60);
    expect(() => store.create('100004', fakeWs, 60)).toThrow('session_store_full');
    store.destroy();
  });

  it('allows new sessions after expired entries are reaped via capacity-miss purge', async () => {
    const store = new SessionStore(2);
    // Use a 0s TTL so the entries are immediately past their expiresAt.
    // The purge that runs inside create() when the store is full should
    // reap them and let the new session in.
    store.create('200001', fakeWs, 0);
    store.create('200002', fakeWs, 0);
    expect(store.size).toBe(2);

    // Small delay so expiresAt is strictly in the past.
    await new Promise((r) => setTimeout(r, 5));

    // Capacity exceeded, but the internal purge should free both slots.
    store.create('200003', fakeWs, 60);
    expect(store.size).toBe(1);
    store.destroy();
  });

  it('still rejects OTC collisions with a distinct error', () => {
    const store = new SessionStore(10);
    store.create('300001', fakeWs, 60);
    expect(() => store.create('300001', fakeWs, 60)).toThrow('OTC already in use');
    store.destroy();
  });

  it('default cap is large enough that legitimate workloads are unaffected', () => {
    const store = new SessionStore();
    // Open 100 — tiny fraction of default 50k — must succeed trivially.
    for (let i = 0; i < 100; i++) {
      store.create(`${400000 + i}`, fakeWs, 60);
    }
    expect(store.size).toBe(100);
    store.destroy();
  });
});
