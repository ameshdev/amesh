/**
 * Abstract nonce store interface.
 * Any backend (in-memory, Redis, DynamoDB) must implement this.
 * The checkAndRecord method MUST be atomic — check and record in a single operation.
 */
export interface NonceStore {
  checkAndRecord(nonce: string, ttlSeconds: number): Promise<boolean>;
  close?(): Promise<void>;
}

/**
 * In-memory nonce store. Works for single-instance deployments.
 * WARNING: Does NOT work for multi-instance (Lambda, K8s replicas, auto-scaling).
 */
export class InMemoryNonceStore implements NonceStore {
  private store = new Map<string, number>();
  private readonly sweepInterval: ReturnType<typeof setInterval>;

  constructor(sweepIntervalSeconds = 30) {
    this.sweepInterval = setInterval(() => this.sweep(), sweepIntervalSeconds * 1000);
    this.sweepInterval.unref();
  }

  checkAndRecord(nonce: string, ttlSeconds: number): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    this.sweep(now);

    if (this.store.has(nonce)) {
      return Promise.resolve(false);
    }

    this.store.set(nonce, now + ttlSeconds);
    return Promise.resolve(true);
  }

  async close(): Promise<void> {
    clearInterval(this.sweepInterval);
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }

  private sweep(now = Math.floor(Date.now() / 1000)): void {
    for (const [nonce, expiry] of this.store) {
      if (expiry < now) this.store.delete(nonce);
    }
  }
}
