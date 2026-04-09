import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { createRelayServer } from '../server.js';

/**
 * Regression test for H4 — bootstrap token single-use enforcement.
 *
 * A leaked bootstrap token must not be usable to pair a second target after
 * the first has already initiated bootstrap. The relay keeps a consumed-jti
 * set; the second `bootstrap_init` for the same jti must be rejected with
 * `token_already_used`.
 */
describe('relay bootstrap single-use enforcement (H4)', () => {
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
      setTimeout(() => reject(new Error('ws connect timeout')), 2000);
    });
  }

  function waitForMessage(ws: WebSocket, timeoutMs = 1000): Promise<Record<string, unknown>> {
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
      }, timeoutMs);
    });
  }

  it('rejects a replayed bootstrap_init for the same jti', async () => {
    const jti = `bt_test_${crypto.randomUUID()}`;

    // Register a watcher on the jti first (simulates the controller device).
    const watcherWs = await openWs();
    watcherWs.send(JSON.stringify({ type: 'bootstrap_watch', jti }));
    const watchAck = await waitForMessage(watcherWs);
    expect(watchAck.type).toBe('bootstrap_watching');

    // First bootstrap_init: should succeed (forwarded to watcher).
    const target1 = await openWs();
    target1.send(
      JSON.stringify({
        type: 'bootstrap_init',
        jti,
        token: 'dummy-token',
        targetPubKey: 'dummy-pub',
      }),
    );
    const forwardedToWatcher = await waitForMessage(watcherWs);
    expect(forwardedToWatcher.type).toBe('bootstrap_init');
    expect(forwardedToWatcher.jti).toBe(jti);

    // jti should now be in the consumed set.
    expect(relay._consumedJtis.has(jti)).toBe(true);

    // Second bootstrap_init with the SAME jti (simulating an attacker with a
    // leaked token) must be rejected.
    const target2 = await openWs();
    target2.send(
      JSON.stringify({
        type: 'bootstrap_init',
        jti,
        token: 'dummy-token',
        targetPubKey: 'attacker-pub',
      }),
    );
    const rejection = await waitForMessage(target2);
    expect(rejection.type).toBe('bootstrap_reject');
    expect(rejection.error).toBe('token_already_used');

    target1.close();
    target2.close();
    watcherWs.close();
  });

  it('allows distinct jtis to bootstrap independently', async () => {
    const jtiA = `bt_test_${crypto.randomUUID()}`;
    const jtiB = `bt_test_${crypto.randomUUID()}`;

    const watcherA = await openWs();
    watcherA.send(JSON.stringify({ type: 'bootstrap_watch', jti: jtiA }));
    await waitForMessage(watcherA);

    const watcherB = await openWs();
    watcherB.send(JSON.stringify({ type: 'bootstrap_watch', jti: jtiB }));
    await waitForMessage(watcherB);

    const targetA = await openWs();
    targetA.send(
      JSON.stringify({ type: 'bootstrap_init', jti: jtiA, token: 't', targetPubKey: 'p' }),
    );
    const msgA = await waitForMessage(watcherA);
    expect(msgA.type).toBe('bootstrap_init');

    const targetB = await openWs();
    targetB.send(
      JSON.stringify({ type: 'bootstrap_init', jti: jtiB, token: 't', targetPubKey: 'p' }),
    );
    const msgB = await waitForMessage(watcherB);
    expect(msgB.type).toBe('bootstrap_init');

    targetA.close();
    targetB.close();
    watcherA.close();
    watcherB.close();
  });

  it('jti is burned even if the first bootstrap fails downstream', async () => {
    // Simulates: first bootstrap_init reaches the relay, watcher forwards it,
    // but pairing never completes (target crashes, bad signature, etc). The
    // jti must still be burned — otherwise an attacker could retry with the
    // same token.
    const jti = `bt_test_${crypto.randomUUID()}`;

    const watcher = await openWs();
    watcher.send(JSON.stringify({ type: 'bootstrap_watch', jti }));
    await waitForMessage(watcher);

    const target1 = await openWs();
    target1.send(JSON.stringify({ type: 'bootstrap_init', jti, token: 't', targetPubKey: 'p' }));
    await waitForMessage(watcher);

    // Simulate the target going away without completing bootstrap.
    target1.close();
    await new Promise((r) => setTimeout(r, 50));

    // Attacker now tries with the same jti.
    const target2 = await openWs();
    target2.send(
      JSON.stringify({ type: 'bootstrap_init', jti, token: 't', targetPubKey: 'attacker' }),
    );
    const rejection = await waitForMessage(target2);
    expect(rejection.type).toBe('bootstrap_reject');
    expect(rejection.error).toBe('token_already_used');

    target2.close();
    watcher.close();
  });
});
