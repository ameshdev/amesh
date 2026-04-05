import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { createRelayServer } from '../server.js';

/**
 * End-to-end M2 regression: wire maxSessions=2 through createRelayServer and
 * drive the relay with a third `listen` to confirm the overflow surfaces as
 * `{type: 'error', code: 'relay_capacity'}` (not the OTC-in-use code).
 */
describe('relay session capacity (M2, integration)', () => {
  let relay: ReturnType<typeof createRelayServer>;
  let relayUrl: string;

  beforeAll(() => {
    relay = createRelayServer({
      host: '127.0.0.1',
      port: 0,
      maxSessions: 2,
    });
    const addr = relay.start();
    relayUrl = `ws://127.0.0.1:${addr.port}/ws`;
  });

  afterAll(() => {
    relay.stop();
  });

  function openSendAndReceive(otc: string): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(relayUrl);
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({ type: 'listen', otc }));
      });
      ws.addEventListener('message', (event: MessageEvent) => {
        const raw = typeof event.data === 'string' ? event.data : String(event.data);
        try {
          resolve(JSON.parse(raw));
        } catch (err) {
          reject(err);
        }
        // Keep the socket open so the session stays in the store for the
        // next test iteration to observe. Caller closes when done.
      });
      ws.addEventListener('error', (e) => reject(e));
      setTimeout(() => reject(new Error('timeout')), 2000);
    });
  }

  it('returns relay_capacity (not otc_in_use) when the store is full', async () => {
    // First two listens should succeed
    const a = await openSendAndReceive('600001');
    expect(a.type).toBe('ack');

    const b = await openSendAndReceive('600002');
    expect(b.type).toBe('ack');

    // Third must be rejected with relay_capacity — the store is full, and
    // the OTC is fresh so it's NOT an otc_in_use collision.
    const c = await openSendAndReceive('600003');
    expect(c.type).toBe('error');
    expect(c.code).toBe('relay_capacity');
  });
});
