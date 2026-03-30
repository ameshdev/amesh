# amesh: Redis Nonce Adapter
**Status:** Implementation Spec  
**Scope:** `@authmesh/sdk` — nonce store abstraction + Redis adapter  
**Prerequisite:** `amesh-spec-v1.md`, `amesh-hardware-key-storage.md`

---

## Why This Exists

The in-memory nonce store in the verification middleware is a `Map<string, number>` that lives inside a single process. It works correctly for single-instance deployments. It breaks silently for everything else.

The failure mode is invisible and dangerous. If two Lambda instances are running and a request hits Instance A, the nonce is stored in A's memory. If an attacker immediately replays the same request to Instance B, Instance B has no record of the nonce — it passes verification. **Replay protection is completely defeated without the client or server knowing anything is wrong.**

This is not a theoretical attack. Auto-scaling, rolling deploys, and serverless cold starts all produce multi-instance environments as a matter of routine.

This spec defines:
1. A `NonceStore` interface that decouples the middleware from any specific backend
2. A built-in Redis adapter implementing that interface
3. A drop-in upgrade path that requires a single config change from the developer

---

## The Scope of This Week

**In scope:**
- `NonceStore` interface (abstract)
- `InMemoryNonceStore` (existing behavior, now explicit)
- `RedisNonceStore` adapter
- Updated `authMeshVerify` middleware to accept a custom store
- Integration tests for both stores
- README section on multi-instance deployments

**Out of scope:**
- Other distributed stores (Memcached, DynamoDB, Valkey) — the interface supports them, but only Redis ships this week
- Nonce store clustering / Redis Sentinel / Redis Cluster — document as supported, don't build adapters
- Automatic store detection — the developer explicitly configures which store to use

---

## The Interface

Everything is built against this. The middleware does not know or care what is behind it.

```typescript
// packages/sdk/src/nonce-store.ts

export interface NonceStore {
  /**
   * Check if a nonce is valid (not previously seen), then record it.
   * Must be atomic — check and record in a single operation.
   * Returns true if the nonce is fresh (request should proceed).
   * Returns false if the nonce has been seen before (replay — reject request).
   */
  checkAndRecord(nonce: string, ttlSeconds: number): Promise<boolean>;

  /**
   * Optional: clean up resources (close connections, clear timers).
   * Called when the middleware is torn down.
   */
  close?(): Promise<void>;
}
```

### Why `checkAndRecord` Must Be Atomic

A non-atomic implementation has a race condition:

```
Instance A: check("nonce_xyz") → not found → ✓
Instance B: check("nonce_xyz") → not found → ✓   ← same nonce, concurrent request
Instance A: record("nonce_xyz")
Instance B: record("nonce_xyz")
```

Both instances accept the same nonce. The entire point of the nonce store is defeated. Atomicity is not a performance concern — it is the correctness constraint. Redis `SET NX EX` is atomic at the server level. The in-memory store uses synchronous JavaScript (single-threaded) which is atomic by the event loop.

---

## Implementation 1: InMemoryNonceStore

The existing behavior, now explicit and tested. Unchanged behavior, new name.

```typescript
// packages/sdk/src/nonce-stores/in-memory.ts

import type { NonceStore } from '../nonce-store';

export class InMemoryNonceStore implements NonceStore {
  private store = new Map<string, number>(); // nonce → expiry (unix seconds)
  private sweepInterval: ReturnType<typeof setInterval>;

  constructor(sweepIntervalSeconds = 30) {
    // Periodic sweep to prevent unbounded memory growth
    this.sweepInterval = setInterval(
      () => this.sweep(),
      sweepIntervalSeconds * 1000
    );
    // Do not prevent process exit
    this.sweepInterval.unref();
  }

  checkAndRecord(nonce: string, ttlSeconds: number): Promise<boolean> {
    // Synchronous — atomic by the JS event loop (single-threaded)
    const now = Math.floor(Date.now() / 1000);
    this.sweep(now);

    if (this.store.has(nonce)) {
      return Promise.resolve(false); // replay detected
    }

    this.store.set(nonce, now + ttlSeconds);
    return Promise.resolve(true); // fresh nonce
  }

  async close(): Promise<void> {
    clearInterval(this.sweepInterval);
    this.store.clear();
  }

  private sweep(now = Math.floor(Date.now() / 1000)): void {
    for (const [nonce, expiry] of this.store) {
      if (expiry < now) this.store.delete(nonce);
    }
  }

  // Exposed for testing only
  get size(): number { return this.store.size; }
}
```

---

## Implementation 2: RedisNonceStore

### The Redis Command

The entire implementation rests on one Redis command:

```
SET <key> 1 EX <ttl> NX
```

- `SET` — set a key
- `EX <ttl>` — expire after `ttl` seconds (Redis handles cleanup)
- `NX` — only set if the key does **Not eXist**

Redis executes this as a single atomic operation at the server level. If the key already exists, the command returns `null`. If it was just created, it returns `"OK"`. This is the check-and-record in one round trip.

```typescript
// packages/sdk/src/nonce-stores/redis.ts

import type { NonceStore } from '../nonce-store';

// We use ioredis. It is the most production-hardened Redis client for Node.js.
// It supports Sentinel, Cluster, automatic reconnection, and has TypeScript types.
// Install: pnpm add ioredis
import Redis, { type RedisOptions } from 'ioredis';

export interface RedisNonceStoreOptions {
  /**
   * Pass an existing ioredis instance if you already have one in your app.
   * If omitted, provide `redisOptions` or `redisUrl` to create one internally.
   */
  client?: Redis;

  /**
   * ioredis connection options.
   * Used only if `client` is not provided.
   */
  redisOptions?: RedisOptions;

  /**
   * Redis connection URL (e.g. "redis://localhost:6379").
   * Used only if `client` and `redisOptions` are not provided.
   */
  redisUrl?: string;

  /**
   * Key prefix to namespace amesh nonces in a shared Redis instance.
   * Default: "am:nonce:"
   * Example with prefix "myapp:": keys look like "myapp:am:nonce:<nonce>"
   */
  keyPrefix?: string;
}

export class RedisNonceStore implements NonceStore {
  private client: Redis;
  private readonly owned: boolean; // true if we created the client, false if injected
  private readonly keyPrefix: string;

  constructor(options: RedisNonceStoreOptions = {}) {
    this.keyPrefix = options.keyPrefix ?? 'am:nonce:';

    if (options.client) {
      this.client = options.client;
      this.owned = false;
    } else if (options.redisOptions) {
      this.client = new Redis(options.redisOptions);
      this.owned = true;
    } else if (options.redisUrl) {
      this.client = new Redis(options.redisUrl);
      this.owned = true;
    } else {
      // Default: connect to localhost:6379
      this.client = new Redis();
      this.owned = true;
    }

    // Surface connection errors — do not silently swallow them
    this.client.on('error', (err) => {
      console.error('[amesh] Redis nonce store connection error:', err.message);
    });
  }

  async checkAndRecord(nonce: string, ttlSeconds: number): Promise<boolean> {
    const key = `${this.keyPrefix}${nonce}`;

    // SET key 1 EX ttl NX
    // Returns "OK" if key was set (nonce is fresh)
    // Returns null if key already existed (replay detected)
    const result = await this.client.set(key, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async close(): Promise<void> {
    // Only disconnect if we own the client
    // If the caller injected their own client, they manage its lifecycle
    if (this.owned) {
      await this.client.quit();
    }
  }
}
```

---

## Updated Middleware

The middleware now accepts a `nonceStore` option. If not provided, it defaults to `InMemoryNonceStore` and emits a warning in production.

```typescript
// packages/sdk/src/middleware.ts

import type { Request, Response, NextFunction } from 'express';
import type { NonceStore } from './nonce-store';
import { InMemoryNonceStore } from './nonce-stores/in-memory';
import { verifyMessage, buildCanonicalString } from '@authmesh/core';
import { loadAllowList } from './allow-list';

export interface AuthMeshVerifyOptions {
  allowListPath?: string;
  clockSkewSeconds?: number;
  nonceWindowSeconds?: number;

  /**
   * The nonce store to use for replay protection.
   *
   * - Single instance (dev, simple server): omit this — defaults to InMemoryNonceStore.
   * - Multi-instance (Lambda, Kubernetes, auto-scaling): provide a RedisNonceStore.
   *
   * WARNING: Using the default in-memory store in a multi-instance deployment
   * silently defeats replay protection. See docs/redis-nonce-adapter.md.
   */
  nonceStore?: NonceStore;
}

export function authMeshVerify(options: AuthMeshVerifyOptions = {}) {
  const {
    allowListPath    = '~/.amesh/allow_list.json',
    clockSkewSeconds = 30,
    nonceWindowSeconds = 60,
  } = options;

  // Warn if no nonce store provided and we are likely in production
  let nonceStore = options.nonceStore;
  if (!nonceStore) {
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '[amesh] WARNING: No nonceStore provided. Using in-memory store.\n' +
        '  Replay protection will not work across multiple instances.\n' +
        '  Provide a RedisNonceStore for production multi-instance deployments.\n' +
        '  See: https://github.com/ameshdev/amesh/blob/main/docs/redis-nonce-adapter.md'
      );
    }
    nonceStore = new InMemoryNonceStore();
  }

  return async function authMeshMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    // Step 1 — Parse header
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('AuthMesh ')) {
      return res.status(400).json({ error: 'missing_header' });
    }

    const parsed = parseAuthMeshHeader(authHeader);
    if (!parsed) {
      return res.status(400).json({ error: 'malformed_header' });
    }

    const { v, id, ts, nonce, sig } = parsed;

    // Step 2 — Version check
    if (v !== '1') {
      return res.status(400).json({ error: 'unsupported_version' });
    }

    // Step 3 — Identity lookup
    const allowList = await loadAllowList(allowListPath);
    const device = allowList.devices.find(d => d.publicKey === id);
    if (!device) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    // Step 4 — Clock check
    const serverNow = Math.floor(Date.now() / 1000);
    const tsNum = parseInt(ts, 10);
    if (isNaN(tsNum) || Math.abs(serverNow - tsNum) > clockSkewSeconds) {
      return res.status(401).json({ error: 'timestamp_out_of_range' });
    }
    if (Math.abs(serverNow - tsNum) > clockSkewSeconds - 10) {
      console.warn(`[amesh] Clock skew warning: ${Math.abs(serverNow - tsNum)}s`);
    }

    // Step 5 — Nonce check (mandatory, now properly abstracted)
    const nonceIsValid = await nonceStore!.checkAndRecord(nonce, nonceWindowSeconds);
    if (!nonceIsValid) {
      return res.status(401).json({ error: 'replay_detected' });
    }

    // Step 6 — Reconstruct canonical string
    const rawBody = (req as any).rawBody ?? Buffer.alloc(0);
    const M = buildCanonicalString({
      version:   v,
      method:    req.method,
      path:      req.originalUrl,
      timestamp: ts,
      nonce,
      body:      rawBody,
    });

    // Step 7 — Verify signature
    const publicKeyBytes = Buffer.from(id, 'base64url');
    const signatureBytes = Buffer.from(sig, 'base64url');
    const valid = await verifyMessage(M, signatureBytes, publicKeyBytes);
    if (!valid) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    // Step 8 — Attach identity
    (req as any).authMesh = {
      deviceId:    device.deviceId,
      friendlyName: device.friendlyName,
      verifiedAt:  serverNow,
    };

    next();
  };
}

function parseAuthMeshHeader(header: string): Record<string, string> | null {
  try {
    const content = header.replace(/^AuthMesh /, '');
    const result: Record<string, string> = {};
    const regex = /(\w+)="([^"]+)"/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      result[match[1]] = match[2];
    }
    if (!result.v || !result.id || !result.ts || !result.nonce || !result.sig) {
      return null;
    }
    return result;
  } catch {
    return null;
  }
}
```

---

## Developer-Facing API

### Single Instance (default — no change needed)

```typescript
import { authMeshVerify } from '@authmesh/sdk';

app.use('/api', authMeshVerify());
// Uses InMemoryNonceStore automatically
// Prints a warning in NODE_ENV=production
```

### Multi-Instance (Redis)

```typescript
import { authMeshVerify } from '@authmesh/sdk';
import { RedisNonceStore } from '@authmesh/sdk/redis';

const nonceStore = new RedisNonceStore({
  redisUrl: process.env.REDIS_URL, // "redis://your-redis-host:6379"
});

app.use('/api', authMeshVerify({ nonceStore }));
```

### Bring Your Own Redis Client

```typescript
import Redis from 'ioredis';
import { RedisNonceStore } from '@authmesh/sdk/redis';

// You already have a Redis client in your app — reuse it
const redis = new Redis(process.env.REDIS_URL);
const nonceStore = new RedisNonceStore({ client: redis });

app.use('/api', authMeshVerify({ nonceStore }));
```

### Lambda / Serverless

```typescript
// handler.ts
import { authMeshVerify } from '@authmesh/sdk';
import { RedisNonceStore } from '@authmesh/sdk/redis';

// Create store OUTSIDE the handler — reuse across warm invocations
const nonceStore = new RedisNonceStore({
  redisUrl: process.env.REDIS_URL,
});

const verify = authMeshVerify({ nonceStore });

export const handler = async (event: APIGatewayEvent) => {
  // Convert Lambda event to Express-compatible req/res and run middleware
  // Use a Lambda middleware adapter like @vendia/serverless-express
};
```

### Custom NonceStore (e.g. DynamoDB, Valkey, Upstash)

```typescript
import type { NonceStore } from '@authmesh/sdk';

class DynamoNonceStore implements NonceStore {
  async checkAndRecord(nonce: string, ttlSeconds: number): Promise<boolean> {
    // Use DynamoDB conditional write:
    // PutItem with ConditionExpression: "attribute_not_exists(nonce)"
    // Returns true on success, false if condition fails (replay)
    try {
      await dynamo.putItem({
        TableName: 'amesh-nonces',
        Item: {
          nonce: { S: nonce },
          ttl:   { N: String(Math.floor(Date.now() / 1000) + ttlSeconds) },
        },
        ConditionExpression: 'attribute_not_exists(nonce)',
      }).promise();
      return true;
    } catch (err: any) {
      if (err.code === 'ConditionalCheckFailedException') return false;
      throw err; // unexpected error — let middleware handle it
    }
  }
}
```

---

## Testing Strategy

### Unit Tests

```typescript
// packages/sdk/src/nonce-stores/nonce-store.test.ts
// Same test suite runs against both stores

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { NonceStore } from '../nonce-store';
import { InMemoryNonceStore } from './in-memory';
// import { RedisNonceStore } from './redis'; // requires Redis — see integration tests

function testNonceStore(name: string, factory: () => NonceStore) {
  describe(name, () => {
    let store: NonceStore;

    beforeEach(() => { store = factory(); });
    afterEach(async () => { await store.close?.(); });

    it('accepts a fresh nonce', async () => {
      const result = await store.checkAndRecord('nonce_aaa', 60);
      expect(result).toBe(true);
    });

    it('rejects a replayed nonce immediately', async () => {
      await store.checkAndRecord('nonce_bbb', 60);
      const result = await store.checkAndRecord('nonce_bbb', 60);
      expect(result).toBe(false);
    });

    it('accepts different nonces independently', async () => {
      const r1 = await store.checkAndRecord('nonce_ccc', 60);
      const r2 = await store.checkAndRecord('nonce_ddd', 60);
      expect(r1).toBe(true);
      expect(r2).toBe(true);
    });

    it('accepts an expired nonce after TTL', async () => {
      // Use TTL of 1 second
      await store.checkAndRecord('nonce_eee', 1);
      await new Promise(r => setTimeout(r, 1100));
      const result = await store.checkAndRecord('nonce_eee', 1);
      expect(result).toBe(true); // should be fresh again after expiry
    });

    it('handles concurrent requests for the same nonce', async () => {
      // Fire 10 concurrent requests with the same nonce
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          store.checkAndRecord('nonce_concurrent', 60)
        )
      );
      // Exactly one should succeed
      const accepted = results.filter(r => r === true);
      const rejected = results.filter(r => r === false);
      expect(accepted).toHaveLength(1);
      expect(rejected).toHaveLength(9);
    });
  });
}

testNonceStore('InMemoryNonceStore', () => new InMemoryNonceStore());
// Integration tests below handle Redis
```

> **The concurrency test is the most important one.** The in-memory store passes it because JavaScript is single-threaded. The Redis store passes it because `SET NX` is atomic. Any custom implementation must pass this test.

### Integration Tests (require a running Redis)

```typescript
// packages/sdk/src/nonce-stores/redis.integration.test.ts
// Run with: REDIS_URL=redis://localhost:6379 vitest run redis.integration

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { RedisNonceStore } from './redis';

const redisUrl = process.env.REDIS_URL;
const skip = !redisUrl;

describe.skipIf(skip)('RedisNonceStore integration', () => {
  let store: RedisNonceStore;

  beforeAll(() => {
    store = new RedisNonceStore({ redisUrl, keyPrefix: 'test:am:nonce:' });
  });

  afterAll(async () => {
    await store.close();
  });

  it('accepts a fresh nonce', async () => {
    const result = await store.checkAndRecord(`nonce_${Date.now()}_a`, 60);
    expect(result).toBe(true);
  });

  it('rejects a replay', async () => {
    const nonce = `nonce_${Date.now()}_b`;
    await store.checkAndRecord(nonce, 60);
    const result = await store.checkAndRecord(nonce, 60);
    expect(result).toBe(false);
  });

  it('key expires correctly in Redis', async () => {
    const nonce = `nonce_${Date.now()}_c`;
    await store.checkAndRecord(nonce, 1); // 1 second TTL
    await new Promise(r => setTimeout(r, 1100));
    const result = await store.checkAndRecord(nonce, 1);
    expect(result).toBe(true); // key expired, nonce is fresh again
  });
});
```

### Running Integration Tests in CI

Add a Redis service to your GitHub Actions workflow:

```yaml
# .github/workflows/test.yml
services:
  redis:
    image: redis:7-alpine
    ports:
      - 6379:6379
    options: >-
      --health-cmd "redis-cli ping"
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5

env:
  REDIS_URL: redis://localhost:6379
```

---

## Redis Infrastructure Notes

### What Redis Version to Require

Redis 2.6.12 or later. The `SET key value EX seconds NX` syntax was introduced in Redis 2.6.12. Every managed Redis service (ElastiCache, Upstash, Redis Cloud, Railway, Fly.io) ships a version far newer than this.

### Key Sizing

Each nonce key:
- Key: `am:nonce:` (9 bytes) + nonce (24 bytes Base64URL) = ~33 bytes
- Value: `1` (1 byte)
- Redis overhead: ~64 bytes per key

At 1,000 requests/second with a 60-second window: 60,000 keys × ~100 bytes = ~6 MB. This is negligible. Redis handles millions of keys trivially.

### Redis Does TTL Cleanup Automatically

Unlike the in-memory store, there is no sweep loop needed. Redis handles key expiry internally. The `EX` option on `SET` guarantees the key is deleted after `ttlSeconds` — no manual cleanup required.

### Recommended Managed Redis for Each Deployment Target

| Deployment | Recommended Redis | Notes |
|---|---|---|
| AWS Lambda | Upstash Redis | Serverless pricing, HTTP API option avoids VPC complexity |
| AWS ECS / EC2 | AWS ElastiCache | Same VPC, lowest latency |
| Fly.io | Fly Redis (built-in) | One command: `fly redis create` |
| Railway | Railway Redis plugin | One click, auto-injects `REDIS_URL` |
| Kubernetes | Redis Helm chart | `helm install redis bitnami/redis` |
| Local dev | Docker | `docker run -p 6379:6379 redis:7-alpine` |

---

## Documentation to Ship With This

Add a `docs/redis-nonce-adapter.md` file to the repo:

```markdown
# Multi-Instance Deployments

By default, amesh uses an in-memory nonce store. This works correctly
for single-process servers. It does NOT work for:

- AWS Lambda (multiple concurrent instances)
- Kubernetes with replica count > 1
- Auto-scaling groups
- Any deployment where more than one process handles requests

**Symptom of the problem:** Replay attacks succeed silently. 
No errors, no logs, requests just pass when they should be rejected.

## The Fix

Provide a Redis nonce store:

\`\`\`typescript
import { RedisNonceStore } from '@authmesh/sdk/redis';

const nonceStore = new RedisNonceStore({
  redisUrl: process.env.REDIS_URL,
});

app.use('/api', authMeshVerify({ nonceStore }));
\`\`\`

Any Redis-compatible store works: AWS ElastiCache, Upstash, Redis Cloud,
Fly Redis, or a self-hosted instance.

## Custom Stores

Implement the `NonceStore` interface to use any backend (DynamoDB,
Memcached, Valkey, etc.). The only requirement is that `checkAndRecord`
is atomic — check and record in a single operation.
```

---

## Build Order for the Week

| Day | Task | Done When |
|---|---|---|
| **Mon** | Extract `NonceStore` interface. Wrap existing map in `InMemoryNonceStore`. All existing tests still pass. | `vitest` green, no behaviour change |
| **Tue** | Write the full unit test suite (`nonce-store.test.ts`) against `InMemoryNonceStore`. | All 5 tests pass including concurrency test |
| **Wed** | Build `RedisNonceStore`. Run unit tests against it with a local Redis Docker container. | Same 5 tests pass for Redis |
| **Thu** | Update `authMeshVerify` middleware to accept `nonceStore` option. Add `NODE_ENV=production` warning. | Middleware tests pass. Warning prints correctly. |
| **Fri** | Integration tests in CI (GitHub Actions Redis service). Write `docs/redis-nonce-adapter.md`. | CI green with Redis. README updated. |

---

## Exit Criteria for This Week

Before moving to Automated Provisioning, verify:

- [ ] `NonceStore` interface is defined and exported from `@authmesh/sdk`
- [ ] `InMemoryNonceStore` passes all 5 unit tests including the concurrency test
- [ ] `RedisNonceStore` passes the same 5 unit tests against a real Redis instance
- [ ] The concurrency test passes for Redis specifically — this is the atomicity proof
- [ ] `authMeshVerify` middleware accepts `nonceStore` option with no breaking changes
- [ ] `NODE_ENV=production` without a custom store prints a clear warning
- [ ] CI runs Redis integration tests via GitHub Actions service
- [ ] `docs/redis-nonce-adapter.md` is written and linked from the main README
- [ ] `ioredis` is pinned to an exact version in `package.json`

---

*End of amesh-redis-nonce-adapter.md*  
*Next document: `amesh-automated-provisioning.md` (bootstrap tokens for CI/CD)*