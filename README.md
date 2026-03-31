# amesh

**Hardware-bound M2M authentication. Replace API keys with cryptographic device identity.**

No `.env` files. No secrets in CI. No tokens in Slack. The private key lives in your chip --- there is nothing to leak.

[![CI](https://github.com/ameshdev/amesh/actions/workflows/ci.yml/badge.svg)](https://github.com/ameshdev/amesh/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](./LICENSE)

---

## Before and After

```js
// Before: static secret that can leak
fetch("/api/orders", {
  headers: { Authorization: `Bearer ${process.env.API_KEY}` }
});
```

```js
// After: hardware-bound signature, nothing to leak
import { amesh } from '@authmesh/sdk';

amesh.fetch("/api/orders", {
  method: "POST",
  body: JSON.stringify({ amount: 100 })
});
```

No `.env`. No secret. The request is signed with a P-256 ECDSA key stored in your machine's Secure Enclave or TPM.

---

## Install

```bash
npm install @authmesh/sdk          # signing client + verification middleware
npm install -g @authmesh/cli       # CLI for device management
```

## Quickstart

### 1. Create a device identity

```bash
amesh init --name "prod-api"
# Identity created.
#   Device ID : am_cOixWcOdI8-pLh4P
#   Backend   : secure-enclave
```

### 2. Pair two machines

On the target machine:
```bash
amesh listen
# Pairing code: 482916
```

On the controller:
```bash
amesh invite 482916
# Verification code: 847291
# Codes match? (Y/n): y
# "prod-api" added to allow list.
```

### 3. Sign requests (2 lines)

```typescript
import { amesh } from '@authmesh/sdk';

const res = await amesh.fetch('https://api.example.com/data', {
  method: 'POST',
  body: JSON.stringify({ amount: 100 })
});
```

### 4. Verify requests (2 lines)

```typescript
import { amesh } from '@authmesh/sdk';

app.use(amesh.verify());
// req.authMesh.deviceId, req.authMesh.friendlyName available
```

---

## How It Works

- **Device identity** --- each machine gets a unique P-256 ECDSA keypair. The private key is stored in Secure Enclave (macOS) or TPM 2.0 (Linux). Hardware-backed key storage is required.
- **Signed requests** --- every HTTP request is signed with the device's private key. The signature covers method, path, timestamp, nonce, and body.
- **Replay protection** --- each request has a unique nonce and a 30-second timestamp window. Nonces are tracked server-side.
- **No static secrets** --- there is no string to leak, rotate, or share. Revoke a compromised device instantly with `amesh revoke`.

---

## Packages

| Package | Description |
|---------|-------------|
| [`@authmesh/sdk`](./packages/sdk) | Signing fetch client + Express verification middleware |
| [`@authmesh/cli`](./packages/cli) | CLI: `init`, `listen`, `invite`, `list`, `revoke`, `provision` |
| [`@authmesh/core`](./packages/core) | Crypto primitives: sign, verify, canonical string, nonce, HMAC, HKDF, ECDH |
| [`@authmesh/keystore`](./packages/keystore) | Key storage drivers: Secure Enclave, macOS Keychain, TPM 2.0 |
| [`@authmesh/relay`](./packages/relay) | WebSocket relay for device pairing handshakes |

---

## Architecture

```
[Pairing — one time]
  Device A  <--WebSocket-->  Relay  <--WebSocket-->  Device B
  (P-256 ECDH + ChaCha20-Poly1305 + SAS verification)

[Runtime — every request]
  Device A  ----HTTP + AuthMesh header---->  Device B
  (no relay, no server, fully P2P)
```

The relay is only needed for the initial pairing handshake. After devices exchange public keys, all authentication is stateless HTTP headers. The relay can be shut down and all existing pairings continue working.

---

## Self-Hosted

amesh is fully self-contained. No SaaS, no telemetry, no phone-home.

- Install packages from npm (MIT licensed)
- Run your own relay: Docker, Cloud Run, Fly.io, Kubernetes, or plain Node.js
- All data stays on your machines (`~/.amesh/`)

See the [Self-Hosting Guide](./docs/self-hosting.md) for deployment options.

---

## Documentation

| Doc | Description |
|-----|-------------|
| [Integration Guide](./docs/integration-guide.md) | Recipes for Express, microservices, webhooks, remote pairing |
| [Self-Hosting Guide](./docs/self-hosting.md) | Deploy the relay: Docker, Cloud Run, Fly.io, Kubernetes |
| [Usage Guide](./docs/guide.md) | CLI commands, SDK usage, crypto primitives |
| [Protocol Spec](./docs/protocol-spec.md) | Full protocol specification (v2.0.0) |
| [Architecture Decisions](./docs/architecture-decisions.md) | ADRs for every design choice |
| [Why amesh](./docs/why-amesh.md) | The problem amesh solves |

---

## Using amesh with AI Assistants

amesh is designed to be easy to integrate with AI coding assistants like Claude, Copilot, and Cursor. The packages have full TypeScript types, and the API surface is minimal.

**Example prompts:**
- "Help me protect my Express API with amesh instead of API keys"
- "Set up `amesh.fetch()` in my Node.js service to call an authenticated endpoint"
- "Configure amesh with Redis nonce store for a multi-instance production deployment"
- "Add amesh device authentication to my microservices"

The SDK has two main functions: `amesh.fetch()` (client) and `amesh.verify()` (server middleware). That's it.

---

## Development

```bash
bun install         # install all deps
bun run build       # turbo build (tsc -b per package)
bun run test        # 135 tests across all packages
bun run lint        # eslint + prettier
```

---

## License

[MIT](./LICENSE)
