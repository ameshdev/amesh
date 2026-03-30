import type { NonceStore } from '@authmesh/core';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export interface RedisNonceStoreOptions {
  /** Pass an existing ioredis instance. */
  client?: unknown;
  /** Redis connection URL (e.g. "redis://localhost:6379"). */
  redisUrl?: string;
  /** Key prefix. Default: "am:nonce:" */
  keyPrefix?: string;
}

/**
 * Redis-backed nonce store for multi-instance deployments.
 * Uses SET NX EX for atomic check-and-record in one round trip.
 *
 * Usage:
 *   import { amesh } from '@authmesh/sdk';
 *   import { RedisNonceStore } from '@authmesh/sdk/redis';
 *   app.use(amesh.verify({ nonceStore: new RedisNonceStore({ redisUrl: process.env.REDIS_URL }) }));
 */
export class RedisNonceStore implements NonceStore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;
  private readonly owned: boolean;
  private readonly keyPrefix: string;

  constructor(options: RedisNonceStoreOptions = {}) {
    this.keyPrefix = options.keyPrefix ?? 'am:nonce:';
    const Redis = require('ioredis');

    if (options.client) {
      this.client = options.client;
      this.owned = false;
    } else {
      this.client = new Redis(options.redisUrl ?? 'redis://localhost:6379');
      this.owned = true;
    }

    this.client.on('error', (err: Error) => {
      console.error('[amesh] Redis nonce store error:', err.message);
    });
  }

  async checkAndRecord(nonce: string, ttlSeconds: number): Promise<boolean> {
    const key = `${this.keyPrefix}${nonce}`;
    const result = await this.client.set(key, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async close(): Promise<void> {
    if (this.owned) {
      await this.client.quit();
    }
  }
}
