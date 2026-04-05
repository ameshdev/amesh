import type { ServerWebSocket } from 'bun';
import type { WebSocketData } from './server.js';

interface AgentEntry {
  socket: ServerWebSocket<WebSocketData>;
  publicKey: string;
  registeredAt: number;
  lastPing: number;
}

/**
 * Constant-time string comparison for the agent registry (L3).
 *
 * Public keys are not secret, but the relay's shell routing pipeline uses
 * the `(deviceId, publicKey)` tuple as the only gate between an enumerating
 * attacker and "this pair is currently registered" side-channel info. A
 * timing-safe compare removes one axis of the oracle; the uniform response
 * from handleShell (C3) removes the other.
 */
function constantTimeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Tracks connected agent daemons by device ID.
 * Agents register with their public key; controllers must provide
 * the matching public key to route a shell request.
 */
export class AgentStore {
  private readonly agents = new Map<string, AgentEntry>();
  private readonly cleanupTimer: ReturnType<typeof setInterval>;
  private readonly heartbeatTimeoutMs: number;

  constructor(heartbeatTimeoutMs = 90_000) {
    this.heartbeatTimeoutMs = heartbeatTimeoutMs;
    this.cleanupTimer = setInterval(() => this.purgeStale(), 30_000);
    this.cleanupTimer.unref();
  }

  register(deviceId: string, publicKey: string, socket: ServerWebSocket<WebSocketData>): boolean {
    const existing = this.agents.get(deviceId);
    if (existing) {
      // Same public key = reconnect (allow), different = squatting attempt (reject)
      if (!constantTimeStringEqual(existing.publicKey, publicKey)) return false;
      // Close old connection if still open
      if (existing.socket.readyState === WebSocket.OPEN) {
        existing.socket.close(1000, 'replaced');
      }
    }
    this.agents.set(deviceId, {
      socket,
      publicKey,
      registeredAt: Date.now(),
      lastPing: Date.now(),
    });
    return true;
  }

  /**
   * Look up an agent by device ID and verify the public key matches.
   * Returns the agent's WebSocket if matched, undefined otherwise.
   */
  matchAndGet(
    deviceId: string,
    expectedPublicKey: string,
  ): ServerWebSocket<WebSocketData> | undefined {
    const entry = this.agents.get(deviceId);
    if (!entry) return undefined;
    if (!constantTimeStringEqual(entry.publicKey, expectedPublicKey)) return undefined;
    if (entry.socket.readyState !== WebSocket.OPEN) {
      this.agents.delete(deviceId);
      return undefined;
    }
    return entry.socket;
  }

  recordPing(socket: ServerWebSocket<WebSocketData>): void {
    for (const [, entry] of this.agents) {
      if (entry.socket === socket) {
        entry.lastPing = Date.now();
        return;
      }
    }
  }

  removeBySocket(socket: ServerWebSocket<WebSocketData>): void {
    for (const [deviceId, entry] of this.agents) {
      if (entry.socket === socket) {
        this.agents.delete(deviceId);
        return;
      }
    }
  }

  get size(): number {
    return this.agents.size;
  }

  private purgeStale(): void {
    const now = Date.now();
    for (const [deviceId, entry] of this.agents) {
      if (
        now - entry.lastPing > this.heartbeatTimeoutMs ||
        entry.socket.readyState !== WebSocket.OPEN
      ) {
        this.agents.delete(deviceId);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
    this.agents.clear();
  }
}
