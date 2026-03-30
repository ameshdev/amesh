# Integration Guide

How to add amesh to your existing application. Each recipe is self-contained — pick the one that matches your setup.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    PAIRING (one-time)                        │
│                                                             │
│  Your Server  ◄──WebSocket──►  Relay  ◄──WebSocket──►  Client Machine  │
│  amesh listen                          amesh invite 482916  │
│                                                             │
│  Both sides verify a 6-digit code, then exchange public     │
│  keys. The relay can be shut down after this.               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                 RUNTIME (every request)                      │
│                                                             │
│  Client Machine ────HTTP + AuthMesh header────► Your Server │
│  amesh.fetch()                   amesh.verify()             │
│                                                             │
│  No relay. No server. Fully P2P. Stateless HTTP headers.    │
└─────────────────────────────────────────────────────────────┘
```

---

## Recipe 1: Protect an Express API

Replace Bearer token authentication with hardware-bound device identity.

### Server setup

```bash
npm install @authmesh/sdk express
```

```typescript
// server.ts
import express from 'express';
import { amesh } from '@authmesh/sdk';

const app = express();

// Parse body as text so amesh can verify the signature over the raw body
app.use(express.text({ type: '*/*' }));

// Add amesh verification middleware — checks signature, timestamp, nonce, allow list
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

# On the server machine: create identity
amesh init --name "prod-api"

# On the client machine: create identity
amesh init --name "my-laptop"

# Start the relay (needed only for pairing)
npx @authmesh/relay

# On the server: start listening for pairing
amesh listen

# On the client: pair with the server (use the 6-digit code from amesh listen)
amesh invite 482916

# Verify the 6-digit SAS code matches on both sides. Done.
# The relay can be stopped now. All future auth is P2P.
```

---

## Pairing Remote Machines

When your server is remote (cloud VM, EC2, etc.), both machines need to reach the same relay.

### Option A: Use the public relay (easiest)

amesh provides a free relay at `relay.authmesh.dev`:

```bash
# On the remote server (SSH in)
amesh listen --relay wss://relay.authmesh.dev/ws

# On your laptop
amesh invite 482916 --relay wss://relay.authmesh.dev/ws
```

### Option B: Run the relay on the remote server

```bash
# On the remote server
npx @authmesh/relay                                      # starts on port 3001
amesh listen --relay ws://localhost:3001/ws

# On your laptop (use the server's public IP or domain)
amesh invite 482916 --relay ws://your-server:3001/ws
```

### Option C: Bootstrap token (non-interactive)

For servers where you can't run interactive commands:

```bash
# On your laptop — generate a token
amesh provision --name "prod-server" --ttl 3600
# Outputs: AMESH_BOOTSTRAP_TOKEN=eyJ...

# Set the token as an env var on the remote server, then run your app.
# The SDK auto-pairs on first request.
```

### Self-hosted relay

For production, you should host your own relay. See the [Self-Hosting Guide](./self-hosting.md) for Docker, Cloud Run, Fly.io, Kubernetes, and plain Node.js deployment options.

---

## Recipe 2: Microservices (Service A calls Service B)

Each service gets its own device identity. Services pair once, then authenticate every request.

### Service B (the API being called)

```typescript
import express from 'express';
import { amesh } from '@authmesh/sdk';

const app = express();
app.use(express.text({ type: '*/*' }));
app.use(amesh.verify());

app.get('/internal/users/:id', (req, res) => {
  console.log(`Request from ${req.authMesh.friendlyName} (${req.authMesh.deviceId})`);
  res.json({ id: req.params.id, name: 'Alice' });
});

app.listen(4000);
```

### Service A (the caller)

```typescript
import { amesh } from '@authmesh/sdk';

async function getUser(id: string) {
  const res = await amesh.fetch(`http://service-b:4000/internal/users/${id}`);
  return res.json();
}
```

### Setup for each service

```bash
# On service-a machine:
amesh init --name "service-a"

# On service-b machine:
amesh init --name "service-b"

# Pair them (run relay, then listen + invite)
# After pairing, service-b's allow list contains service-a's public key
```

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
app.use(express.text({ type: '*/*' }));

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

## Recipe 4: CI/CD with Bootstrap Tokens

For CI runners and containers that can't do interactive pairing, use bootstrap tokens.

### Generate a bootstrap token (on your laptop)

```bash
amesh provision --name "ci-runner" --ttl 3600
# Outputs: AMESH_BOOTSTRAP_TOKEN=eyJ...
```

### Use it in GitHub Actions

```yaml
# .github/workflows/deploy.yml
jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      AMESH_BOOTSTRAP_TOKEN: ${{ secrets.AMESH_BOOTSTRAP_TOKEN }}
      AUTH_MESH_PASSPHRASE: ${{ secrets.AUTH_MESH_PASSPHRASE }}
    steps:
      - uses: actions/checkout@v4
      - run: npm install @authmesh/sdk
      - run: node deploy.js  # amesh.fetch() will auto-bootstrap on first call
```

### In your code

```typescript
import { bootstrapIfNeeded } from '@authmesh/sdk';

// Auto-pairs with the controller if AMESH_BOOTSTRAP_TOKEN is set
// No-op if already paired
await bootstrapIfNeeded();
```

---

## Recipe 5: Kubernetes Per-Pod Identity

Each pod gets its own identity via bootstrap tokens. The relay runs as a service in the cluster.

### Deploy the relay

```yaml
# relay-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: amesh-relay
spec:
  replicas: 1
  selector:
    matchLabels:
      app: amesh-relay
  template:
    metadata:
      labels:
        app: amesh-relay
    spec:
      containers:
        - name: relay
          image: node:20-slim
          command: ["npx", "@authmesh/relay"]
          ports:
            - containerPort: 3001
---
apiVersion: v1
kind: Service
metadata:
  name: amesh-relay
spec:
  selector:
    app: amesh-relay
  ports:
    - port: 3001
```

### Pod init container

```yaml
initContainers:
  - name: amesh-init
    image: node:20-slim
    command: ["npx", "@authmesh/cli", "init", "--name", "$(POD_NAME)"]
    env:
      - name: POD_NAME
        valueFrom:
          fieldRef:
            fieldPath: metadata.name
      - name: AMESH_BOOTSTRAP_TOKEN
        valueFrom:
          secretRef:
            name: amesh-bootstrap
            key: token
      - name: AUTH_MESH_PASSPHRASE
        valueFrom:
          secretRef:
            name: amesh-bootstrap
            key: passphrase
```

---

## Recipe 6: Webhook Authentication

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

No shared secret. The webhook sender proves its identity with a hardware-bound signature.

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AUTH_MESH_DIR` | Directory for identity and keys | `~/.amesh/` |
| `AUTH_MESH_PASSPHRASE` | Passphrase for encrypted-file keystore | (required for encrypted-file backend) |
| `AMESH_BOOTSTRAP_TOKEN` | Bootstrap token for automated pairing | (optional) |
| `RELAY_URL` | WebSocket relay URL | `wss://relay.authmesh.dev/ws` |
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
3. **Body mismatch?** The middleware must parse the body as text (`express.text({ type: '*/*' })`), not as JSON. If you use `express.json()`, the re-serialized body may differ from what the client signed.

### "allow_list_integrity_failure" (500)

The allow list file (`~/.amesh/allow_list.json`) was modified outside of amesh. This is the HMAC seal detecting tampering. Re-pair the devices to regenerate the file.

### "Using in-memory nonce store" warning

You're running in production without a Redis nonce store. Replay attacks could succeed by hitting different instances. See Recipe 3 above.

### Wrong keystore backend

If you see "Running in degraded security mode," the encrypted-file fallback is being used. On macOS, this means Secure Enclave access failed (usually a permissions issue). On Linux, TPM is not available. The encrypted-file backend is secure but software-only.
