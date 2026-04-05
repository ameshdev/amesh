import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { createRelayServer } from '../server.js';

/**
 * Regression test for M3 — bootstrap watcher race / DoS.
 *
 * Before the fix, `handleBootstrapWatch` used `Map.set` unconditionally,
 * allowing any client to overwrite any watcher for any jti. An attacker
 * could continuously claim jtis and starve legitimate controllers off.
 *
 * After the fix, a jti already watched by a DIFFERENT live socket is
 * refused with `jti_already_watched`. Same-socket re-registration still
 * works (reconnect/idempotency).
 */
describe('bootstrap watcher race (M3)', () => {
  let relay: ReturnType<typeof createRelayServer>;
  let relayUrl: string;

  beforeAll(() => {
    relay = createRelayServer({ host: '127.0.0.1', port: 0 });
    const addr = relay.start();
    relayUrl = `ws://127.0.0.1:${addr.port}/ws`;
  });

  afterAll(() => {
    relay.stop();
  });

  function openWs(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(relayUrl);
      ws.addEventListener('open', () => resolve(ws));
      ws.addEventListener('error', (e) => reject(e));
      setTimeout(() => reject(new Error('connect timeout')), 2000);
    });
  }

  function waitForMessage(ws: WebSocket): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const handler = (event: MessageEvent) => {
        ws.removeEventListener('message', handler);
        const raw = typeof event.data === 'string' ? event.data : String(event.data);
        try {
          resolve(JSON.parse(raw));
        } catch (err) {
          reject(err);
        }
      };
      ws.addEventListener('message', handler);
      setTimeout(() => {
        ws.removeEventListener('message', handler);
        reject(new Error('message timeout'));
      }, 1000);
    });
  }

  it('first watcher for a jti succeeds', async () => {
    const ws = await openWs();
    const jti = `bt_${crypto.randomUUID()}`;
    ws.send(JSON.stringify({ type: 'bootstrap_watch', jti }));
    const ack = await waitForMessage(ws);
    expect(ack.type).toBe('bootstrap_watching');
    expect(ack.jti).toBe(jti);
    ws.close();
  });

  it('second watcher on the same jti from a DIFFERENT socket is rejected', async () => {
    const ws1 = await openWs();
    const jti = `bt_${crypto.randomUUID()}`;
    ws1.send(JSON.stringify({ type: 'bootstrap_watch', jti }));
    const first = await waitForMessage(ws1);
    expect(first.type).toBe('bootstrap_watching');

    // Attacker socket tries to hijack the same jti
    const ws2 = await openWs();
    ws2.send(JSON.stringify({ type: 'bootstrap_watch', jti }));
    const second = await waitForMessage(ws2);
    expect(second.type).toBe('error');
    expect(second.code).toBe('jti_already_watched');

    ws1.close();
    ws2.close();
  });

  it('same socket can re-register (reconnect idempotency)', async () => {
    const ws = await openWs();
    const jti = `bt_${crypto.randomUUID()}`;
    ws.send(JSON.stringify({ type: 'bootstrap_watch', jti }));
    const first = await waitForMessage(ws);
    expect(first.type).toBe('bootstrap_watching');

    // Same socket registering again must NOT trip the jti_already_watched
    // guard — the guard only fires for DIFFERENT sockets.
    ws.send(JSON.stringify({ type: 'bootstrap_watch', jti }));
    const second = await waitForMessage(ws);
    expect(second.type).toBe('bootstrap_watching');

    ws.close();
  });

  it('reclaims jti once the previous watcher disconnects', async () => {
    const ws1 = await openWs();
    const jti = `bt_${crypto.randomUUID()}`;
    ws1.send(JSON.stringify({ type: 'bootstrap_watch', jti }));
    await waitForMessage(ws1);

    // Legitimate watcher disconnects — give the server time to process the
    // close frame and remove the entry from bootstrapWatchers.
    ws1.close();
    // Wait for the close event to fully propagate and cleanupSocket to run.
    await new Promise((r) => setTimeout(r, 500));

    // Now a new client may register for the jti. Either the previous entry
    // was removed by the close handler (expected) OR its socket is no
    // longer readyState === OPEN (also sufficient — we explicitly tolerate
    // that case in handleBootstrapWatch).
    const ws2 = await openWs();
    ws2.send(JSON.stringify({ type: 'bootstrap_watch', jti }));
    const ack = await waitForMessage(ws2);
    expect(ack.type).toBe('bootstrap_watching');
    ws2.close();
  });

  it('rejects oversized jti strings', async () => {
    const ws = await openWs();
    const hugeJti = 'bt_' + 'x'.repeat(200);
    ws.send(JSON.stringify({ type: 'bootstrap_watch', jti: hugeJti }));
    const resp = await waitForMessage(ws);
    expect(resp.type).toBe('error');
    expect(resp.code).toBe('invalid_jti');
    ws.close();
  });
});
