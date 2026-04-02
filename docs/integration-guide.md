# Integration Guide

How to add amesh to your existing application. Each recipe is self-contained — pick the one that matches your setup.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PAIRING (one-time)                                │
│                                                                     │
│  Your Server (target) ◄──WS──► Relay ◄──WS──► Client (controller)  │
│  amesh listen                          amesh invite 482916          │
│                                                                     │
│  Both sides verify a 6-digit code, then exchange public keys.       │
│  Trust is one-way: controller → target. Relay can be shut down.     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                 RUNTIME (every request)                              │
│                                                                     │
│  Controller ────HTTP + AuthMesh header────► Target                  │
│  amesh.fetch()                   amesh.verify()                     │
│                                                                     │
│  One-way. No relay. Stateless headers. Target cannot call back.     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Recipe 1: Protect an Express API

Replace Bearer token authentication with device-bound cryptographic identity.

### Server setup

```bash
npm install @authmesh/sdk express
```

```typescript
// server.ts
import express from 'express';
import { amesh } from '@authmesh/sdk';

const app = express();
app.use(express.json());

// Add amesh verification middleware — checks signature, timestamp, nonce, allow list
// Works with express.json(), express.text(), or no body parser at all.
app.use('/api', amesh.verify());

// Public endpoint (no auth)
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Protected endpoint
app.post('/api/orders', (req, res) => {
  res.json({
    message: 'Authenticated!',
    device: req.authMesh.deviceId,
    name: req.authMesh.friendlyName,
  });
});

app.listen(3000, () => console.log('Server on :3000'));
```

### Client setup

```bash
npm install @authmesh/sdk
```

```typescript
// client.ts
import { amesh } from '@authmesh/sdk';

const res = await amesh.fetch('http://localhost:3000/api/orders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ amount: 100 }),
});

console.log(await res.json());
// { message: 'Authenticated!', device: 'am_...', name: 'My Laptop' }
```

### Initial setup (run once per machine)

```bash
# Install the CLI
npm install -g @authmesh/cli

# On the server (target): create identity
amesh init --name "prod-api"

# On your laptop (controller): create identity
amesh init --name "my-laptop"

# Start the relay (needed only for pairing)
npx @authmesh/relay

# On the server (target): start listening for pairing
amesh listen
# ✔ "my-laptop" added as controller.

# On your laptop (controller): pair with the server
amesh invite 482916
# ✔ "prod-api" added as target.

# Trust is one-way: laptop → server. The relay can be stopped now.
```

---

## Pairing Remote Machines

When your server is remote (cloud VM, EC2, etc.), both machines need to reach the same relay.

### Option A: Use the public relay (easiest)

amesh provides a free relay at `relay.authmesh.dev`:

```bash
# On the remote server (target — SSH in)
amesh listen --relay wss://relay.authmesh.dev/ws

# On your laptop (controller)
amesh invite 482916 --relay wss://relay.authmesh.dev/ws
```

### Option B: Run the relay on the remote server

```bash
# On the remote server (target)
npx @authmesh/relay                                      # starts on port 3001
amesh listen --relay ws://localhost:3001/ws

# On your laptop (controller — use the server's public IP or domain)
amesh invite 482916 --relay ws://your-server:3001/ws
```

### Option C: Bootstrap token (non-interactive)

For servers where you can't run interactive commands:

```bash
# On your laptop — generate a token
amesh provision --name "prod-server" --ttl 1h
# Outputs: AMESH_BOOTSTRAP_TOKEN=eyJ...

# Set the token as an env var on the remote server, then run your app.
# The SDK auto-pairs on first request.
```

### Self-hosted relay

For production, you should host your own relay. See the [Self-Hosting Guide](./self-hosting.md) for Docker, Cloud Run, Fly.io, Kubernetes, and plain Node.js deployment options.

---

## Recipe 2: Microservices (Service A calls Service B)

Each service gets its own device identity. Services pair once, then authenticate every request. Trust is one-way: the caller (controller) authenticates to the API (target), not vice versa.

### Service B — the target (the API being called)

```typescript
import express from 'express';
import { amesh } from '@authmesh/sdk';

const app = express();
app.use(express.json());
app.use(amesh.verify());

app.get('/internal/users/:id', (req, res) => {
  console.log(`Request from ${req.authMesh.friendlyName} (${req.authMesh.deviceId})`);
  res.json({ id: req.params.id, name: 'Alice' });
});

app.listen(4000);
```

### Service A — the controller (the caller)

```typescript
import { amesh } from '@authmesh/sdk';

async function getUser(id: string) {
  const res = await amesh.fetch(`http://service-b:4000/internal/users/${id}`);
  return res.json();
}
```

### Setup for each service

```bash
# On service-b machine (target — the API):
amesh init --name "service-b"
amesh listen

# On service-a machine (controller — the caller):
amesh init --name "service-a"
amesh invite 482916

# One-way trust: service-a → service-b.
# service-b's allow list has service-a as [controller].
# service-b cannot authenticate back to service-a.
```

> **Bidirectional auth:** If two services need to call each other, pair them twice — each side runs `amesh listen` once and `amesh invite` once. Each pairing creates a separate one-way trust relationship.

---

## Recipe 3: Redis Nonce Store (Production Multi-Instance)

If you run multiple instances of your server (behind a load balancer), use Redis to share the nonce store. Without this, a replay attack could succeed by hitting a different instance.

```bash
npm install @authmesh/sdk ioredis
```

```typescript
import express from 'express';
import { amesh } from '@authmesh/sdk';
import { RedisNonceStore } from '@authmesh/sdk/redis';

const app = express();
app.use(express.json());

app.use(amesh.verify({
  nonceStore: new RedisNonceStore(process.env.REDIS_URL),
}));

app.post('/api/orders', (req, res) => {
  res.json({ device: req.authMesh.deviceId });
});

app.listen(3000);
```

If you don't provide a `nonceStore`, amesh uses an in-memory store and prints a warning in production.

---

## Recipe 4: Webhook Authentication

Instead of signing webhooks with a shared secret (like `WEBHOOK_SECRET`), sign them with amesh.

### Sending webhooks

```typescript
import { amesh } from '@authmesh/sdk';

async function sendWebhook(url: string, event: object) {
  const res = await amesh.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });
  return res.ok;
}
```

### Receiving webhooks

```typescript
import express from 'express';
import { amesh } from '@authmesh/sdk';

const app = express();
app.use(express.text({ type: '*/*' }));

// Only accept webhooks from paired devices
app.post('/webhooks', amesh.verify(), (req, res) => {
  const event = JSON.parse(req.body);
  console.log(`Webhook from ${req.authMesh.friendlyName}:`, event);
  res.sendStatus(200);
});
```

No shared secret. The webhook sender proves its identity with a device-bound signature.

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AUTH_MESH_DIR` | Directory for identity and keys | `~/.amesh/` |
| `AMESH_BOOTSTRAP_TOKEN` | Bootstrap token for automated pairing | (optional) |
| `AMESH_RELAY_URL` | WebSocket relay URL | `wss://relay.authmesh.dev/ws` |
| `REDIS_URL` | Redis URL for nonce store | (optional) |

---

## TypeScript Types

```typescript
// Available on req.authMesh after amesh.verify()
interface AuthMeshIdentity {
  deviceId: string;       // e.g. "am_cOixWcOdI8-pLh4P"
  friendlyName: string;   // e.g. "prod-api"
  verifiedAt: number;     // Unix timestamp of verification
}

// amesh.verify() options
interface VerifyOptions {
  clockSkewSeconds?: number;    // Default: 30
  nonceWindowSeconds?: number;  // Default: 60
  nonceStore?: NonceStore;      // Default: InMemoryNonceStore
}
```

---

## Troubleshooting

### "unauthorized" on every request

1. **Devices not paired?** Run `amesh list` on the server — the client's device ID must be in the allow list.
2. **Clock skew?** Server and client clocks must be within 30 seconds. Check with `date` on both machines.
3. **Body mismatch?** The middleware handles `express.json()`, `express.text()`, and raw streams automatically. If you use a custom body parser that transforms the body (e.g., XML parsing, decompression), ensure the original body is preserved.

### "allow_list_integrity_failure" (500)

The allow list file (`~/.amesh/allow_list.json`) was modified outside of amesh. This is the HMAC seal detecting tampering. Re-pair the devices to regenerate the file.

### "Using in-memory nonce store" warning

You're running in production without a Redis nonce store. Replay attacks could succeed by hitting different instances. See Recipe 3 above.

### "No supported key storage backend detected"

amesh prefers hardware-backed storage (Secure Enclave, macOS Keychain, TPM 2.0) but also supports an encrypted-file backend for cloud VMs:

```bash
amesh init --name "my-server" --backend encrypted-file --passphrase "your-passphrase"
# Or set AUTH_MESH_PASSPHRASE environment variable
```

On macOS, ensure the Swift helper binary (`amesh-se-helper`) is installed alongside the `amesh` binary for Keychain/Secure Enclave support.
