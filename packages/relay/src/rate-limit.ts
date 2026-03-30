/**
 * Simple in-memory rate limiter for OTC attempts.
 * Max `maxAttempts` failed attempts per IP per `windowMs`.
 */
export class RateLimiter {
  private attempts = new Map<string, { count: number; resetAt: number }>();
  private readonly maxAttempts: number;
  private readonly windowMs: number;

  constructor(maxAttempts = 5, windowMs = 60_000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
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
}
