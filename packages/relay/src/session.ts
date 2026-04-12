import type { ServerWebSocket } from 'bun';
import type { WebSocketData } from './server.js';

/** Maximum bytes forwarded per session (5 MB). Prevents relay cost abuse.
 *  Tight enough to prevent bulk data streaming through the relay. Self-hosted
 *  relays can override by setting a higher value. */
export const SESSION_MAX_BYTES = 5 * 1024 * 1024;

export interface PairingSession {
  otc: string;
  target: ServerWebSocket<WebSocketData>;
  controller: ServerWebSocket<WebSocketData> | null;
  createdAt: number;
  expiresAt: number;
  /** Total bytes forwarded through this session (both directions). */
  bytesForwarded: number;
}

/**
 * Default cap on concurrent sessions. Chosen to bound memory under
 * adversarial listen-flood scenarios: each session holds references to
 * 2 WebSockets + metadata (~1 KB steady state), so 50k sessions ≈ 50 MB
 * of heap pressure. Tunable via createRelayServer options for tests and
 * large deployments.
 */
const DEFAULT_MAX_SESSIONS = 50_000;

/**
 * In-memory session store for active pairing sessions.
 * Sessions are ephemeral — max 60 seconds lifetime for pairing.
 */
export class SessionStore {
  private sessions = new Map<string, PairingSession>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private readonly maxSessions: number;

  constructor(maxSessions: number = DEFAULT_MAX_SESSIONS) {
    this.maxSessions = maxSessions;
    // Purge expired sessions every 10 seconds
    this.cleanupTimer = setInterval(() => this.purge(), 10_000);
  }

  create(otc: string, target: ServerWebSocket<WebSocketData>, ttlSeconds = 60): PairingSession {
    if (this.sessions.has(otc)) {
      throw new Error('OTC already in use');
    }

    // M2 — bound memory under listen-flood DoS. When the store is at capacity,
    // make one last-ditch cleanup pass and then refuse new sessions. Distinct
    // error code from OTC-in-use so the relay can surface a specific reason
    // to legitimate clients hitting a saturated relay.
    if (this.sessions.size >= this.maxSessions) {
      this.purge();
      if (this.sessions.size >= this.maxSessions) {
        throw new Error('session_store_full');
      }
    }

    const now = Date.now();
    const session: PairingSession = {
      otc,
      target,
      controller: null,
      createdAt: now,
      expiresAt: now + ttlSeconds * 1000,
      bytesForwarded: 0,
    };

    this.sessions.set(otc, session);
    return session;
  }

  get(otc: string): PairingSession | undefined {
    const session = this.sessions.get(otc);
    if (session && Date.now() > session.expiresAt) {
      this.remove(otc);
      return undefined;
    }
    return session;
  }

  remove(otc: string): void {
    this.sessions.delete(otc);
  }

  get size(): number {
    return this.sessions.size;
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.sessions.clear();
  }

  private purge(): void {
    const now = Date.now();
    for (const [otc, session] of this.sessions) {
      if (now > session.expiresAt) {
        // Close connections if still open
        try {
          session.target.close();
        } catch {
          /* ignore */
        }
        try {
          session.controller?.close();
        } catch {
          /* ignore */
        }
        this.sessions.delete(otc);
      }
    }
  }
}
