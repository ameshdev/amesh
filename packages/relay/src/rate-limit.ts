/**
 * Simple in-memory rate limiter for OTC attempts.
 * Max `maxAttempts` failed attempts per IP per `windowMs`.
 */
export class RateLimiter {
  private attempts = new Map<string, { count: number; resetAt: number }>();
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly cleanupTimer: ReturnType<typeof setInterval>;

  constructor(maxAttempts = 5, windowMs = 60_000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    // Periodically prune expired entries to prevent unbounded growth
    this.cleanupTimer = setInterval(() => this.purge(), windowMs);
    this.cleanupTimer.unref();
  }

  /**
   * Check if an IP is allowed to make an attempt.
   * Returns true if allowed, false if rate-limited.
   */
  check(ip: string): boolean {
    const now = Date.now();
    const entry = this.attempts.get(ip);

    if (!entry || now > entry.resetAt) {
      this.attempts.set(ip, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (entry.count >= this.maxAttempts) {
      return false;
    }

    entry.count++;
    return true;
  }

  /** Record a failed attempt for an IP. */
  recordFailure(ip: string): void {
    const now = Date.now();
    const entry = this.attempts.get(ip);

    if (!entry || now > entry.resetAt) {
      this.attempts.set(ip, { count: 1, resetAt: now + this.windowMs });
    } else {
      entry.count++;
    }
  }

  /** Reset rate limit for an IP (e.g., on successful connection). */
  reset(ip: string): void {
    this.attempts.delete(ip);
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
    this.attempts.clear();
  }

  private purge(): void {
    const now = Date.now();
    for (const [ip, entry] of this.attempts) {
      if (now > entry.resetAt) this.attempts.delete(ip);
    }
  }
}

/**
 * Per-OTC attempt tracker.
 * Limits the number of failed connect attempts against any single OTC
 * to prevent distributed brute-force attacks.
 */
export class OTCAttemptTracker {
  private attempts = new Map<string, number>();
  private readonly maxAttempts: number;

  constructor(maxAttempts = 10) {
    this.maxAttempts = maxAttempts;
  }

  /** Record a failed attempt. Returns false if the OTC should be invalidated. */
  recordAndCheck(otc: string): boolean {
    const count = (this.attempts.get(otc) ?? 0) + 1;
    this.attempts.set(otc, count);
    return count < this.maxAttempts;
  }

  remove(otc: string): void {
    this.attempts.delete(otc);
  }

  destroy(): void {
    this.attempts.clear();
  }
}
