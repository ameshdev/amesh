import type { WebSocket } from 'ws';

export interface PairingSession {
  otc: string;
  target: WebSocket;
  controller: WebSocket | null;
  createdAt: number;
  expiresAt: number;
}

/**
 * In-memory session store for active pairing sessions.
 * Sessions are ephemeral — max 120 seconds lifetime.
 */
export class SessionStore {
  private sessions = new Map<string, PairingSession>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Purge expired sessions every 10 seconds
    this.cleanupTimer = setInterval(() => this.purge(), 10_000);
  }

  create(otc: string, target: WebSocket, ttlSeconds = 120): PairingSession {
    if (this.sessions.has(otc)) {
      throw new Error('OTC already in use');
    }

    const now = Date.now();
    const session: PairingSession = {
      otc,
      target,
      controller: null,
      createdAt: now,
      expiresAt: now + ttlSeconds * 1000,
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
        try { session.target.close(); } catch { /* ignore */ }
        try { session.controller?.close(); } catch { /* ignore */ }
        this.sessions.delete(otc);
      }
    }
  }
}
