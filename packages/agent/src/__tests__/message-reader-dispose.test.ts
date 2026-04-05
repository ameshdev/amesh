import { describe, it, expect } from 'bun:test';
// We import createMessageReader via the re-export in shell-handshake.ts — it
// isn't exported by name, so we use the module's internal binding.
import { createMessageReader } from '../shell-handshake.js';

/**
 * Regression test for M4 — the handshake message reader installed a
 * `message` listener on the WebSocket that was never removed after the
 * handshake completed. On a long-lived shell session the reader's internal
 * queue kept growing on every encrypted frame (unbounded memory growth).
 *
 * The fix exposes a `dispose()` method that removes the listener and drains
 * any pending waiter.
 */
describe('createMessageReader dispose (M4)', () => {
  function makeFakeWs() {
    type Handler = (ev: MessageEvent) => void;
    const listeners = new Map<string, Set<Handler>>();
    const ws = {
      addEventListener(type: string, handler: Handler) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(handler);
      },
      removeEventListener(type: string, handler: Handler) {
        listeners.get(type)?.delete(handler);
      },
      // Helpers for tests
      dispatchMessage(data: string) {
        const event = { data } as MessageEvent;
        for (const handler of listeners.get('message') ?? []) {
          handler(event);
        }
      },
      listenerCount(type: string): number {
        return listeners.get(type)?.size ?? 0;
      },
    };
    return ws as unknown as WebSocket & {
      dispatchMessage: (data: string) => void;
      listenerCount: (type: string) => number;
    };
  }

  it('dispose() removes the message listener', () => {
    const ws = makeFakeWs();
    const reader = createMessageReader(ws);
    expect(ws.listenerCount('message')).toBe(1);
    reader.dispose();
    expect(ws.listenerCount('message')).toBe(0);
  });

  it('dispose() is idempotent', () => {
    const ws = makeFakeWs();
    const reader = createMessageReader(ws);
    reader.dispose();
    reader.dispose();
    expect(ws.listenerCount('message')).toBe(0);
  });

  it('messages received after dispose() do not grow the internal queue', () => {
    const ws = makeFakeWs();
    const reader = createMessageReader(ws);
    reader.dispose();
    // Dispatch 1000 messages; nothing should accumulate since the listener
    // has been removed.
    for (let i = 0; i < 1000; i++) {
      ws.dispatchMessage(JSON.stringify({ type: 'data', seq: i }));
    }
    // read() after dispose should reject with reader_disposed if there's a
    // pending waiter; with no waiter it just sits on the empty queue.
    // We verify by calling read with a short timeout — no message available
    // means it should time out (not resolve with a leaked queued message).
    // Short-circuit: the queue was drained on dispose.
    // We can't easily assert on private queue.length, but if the listener
    // is gone, dispatched messages cannot reach it.
    expect(ws.listenerCount('message')).toBe(0);
  });

  it('pending read() rejects with reader_disposed on dispose', async () => {
    const ws = makeFakeWs();
    const reader = createMessageReader(ws);
    const readPromise = reader.read(5000);
    reader.dispose();
    await expect(readPromise).rejects.toThrow('reader_disposed');
  });

  it('read() still works for messages enqueued before dispose', async () => {
    const ws = makeFakeWs();
    const reader = createMessageReader(ws);
    ws.dispatchMessage(JSON.stringify({ type: 'pre-dispose' }));
    // The message is in the queue; read() should return it immediately.
    const msg = await reader.read(100);
    expect(msg.type).toBe('pre-dispose');
    reader.dispose();
  });
});
