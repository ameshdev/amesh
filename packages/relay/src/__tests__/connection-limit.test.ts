import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { createRelayServer } from '../server.js';

/**
 * Regression test for M1 — connectionCount double-decrement.
 *
 * Before the fix, `open()` rejecting an overflow connection would decrement
 * `connectionCount` once, and then Bun's subsequent `close()` would decrement
 * it again. Over repeated rejections the counter drifted negative and the
 * MAX_CONNECTIONS gate stopped firing, allowing unbounded connections.
 *
 * This test opens 3 concurrent connections against a relay with
 * maxConnections=2, confirms one is rejected, closes one legitimate
 * connection, and asserts a new connection is then admitted — proving the
 * counter bookkeeping stays consistent across the overflow/close cycle.
 */
describe('relay connection limit (M1)', () => {
  const MAX = 2;
  let relay: ReturnType<typeof createRelayServer>;
  let relayUrl: string;

  beforeAll(() => {
    relay = createRelayServer({ host: '127.0.0.1', port: 0, maxConnections: MAX });
    const addr = relay.start();
    relayUrl = `ws://127.0.0.1:${addr.port}/ws`;
  });

  afterAll(() => {
    relay.stop();
  });

  function openSocket(): Promise<{ ws: WebSocket; opened: boolean; closed: Promise<number> }> {
    return new Promise((resolve) => {
      const ws = new WebSocket(relayUrl);
      let opened = false;
      const closed = new Promise<number>((resolveClose) => {
        ws.addEventListener('close', (e) => resolveClose(e.code));
      });
      ws.addEventListener('open', () => {
        opened = true;
        resolve({ ws, opened, closed });
      });
      ws.addEventListener('error', () => {
        resolve({ ws, opened, closed });
      });
      // Safety timeout in case neither event fires
      setTimeout(() => resolve({ ws, opened, closed }), 1500);
    });
  }

  it('rejects over-limit connections without leaking counter state', async () => {
    // Open MAX legit connections
    const a = await openSocket();
    const b = await openSocket();
    expect(a.opened).toBe(true);
    expect(b.opened).toBe(true);

    // MAX+1 should be rejected with close code 1013 ("too_many_connections")
    const c = await openSocket();
    // The WebSocket opens briefly from the client's perspective then is closed
    // by the server with 1013. We confirm by observing the close code.
    const cCloseCode = await c.closed;
    expect(cCloseCode).toBe(1013);

    // Key assertion: the counter wasn't corrupted. After one legitimate close
    // we should be able to open one (and only one) new connection.
    a.ws.close();
    await a.closed;
    // Give the server a moment to process the close
    await new Promise((r) => setTimeout(r, 100));

    const d = await openSocket();
    expect(d.opened).toBe(true);

    // And a new over-limit attempt must still be rejected — proves the counter
    // tracks actual live connections, not a drifting phantom count.
    const e = await openSocket();
    const eCloseCode = await e.closed;
    expect(eCloseCode).toBe(1013);

    b.ws.close();
    d.ws.close();
  });

  it('burst of overflow rejections does not drive counter negative', async () => {
    // Open MAX legit connections
    const a = await openSocket();
    const b = await openSocket();
    expect(a.opened).toBe(true);
    expect(b.opened).toBe(true);

    // Burst 5 overflow attempts — all must be rejected with 1013
    const rejections = await Promise.all(
      [0, 1, 2, 3, 4].map(async () => {
        const s = await openSocket();
        return s.closed;
      }),
    );
    for (const code of rejections) {
      expect(code).toBe(1013);
    }

    // Counter integrity check: after 5 rejections, the limit is still 2.
    // A new attempt must still be rejected because a and b are still open.
    const extra = await openSocket();
    const extraCode = await extra.closed;
    expect(extraCode).toBe(1013);

    a.ws.close();
    b.ws.close();
  });
});
