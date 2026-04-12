# amesh Guide

What you can do with amesh, step by step.

---

## 1. Run the Tests

```bash
bun install
bun run build
bun run test    # tests across all packages
bun run lint    # eslint + prettier check
```

---

## 2. CLI — Create a Device Identity

The `init` command generates a P-256 keypair and writes identity files to `~/.amesh/`.

```bash
amesh init --name "My Laptop"
```

Output (macOS):
```
Generating P-256 keypair...

Detecting key storage backend:
  Secure Enclave    not available (binary not signed)
  macOS Keychain    selected

Identity created.

  Device ID     : am_cOixWcOdI8-pLh4P
  Public Key    : A+B9pwI1/CGINmyozdPj...
  Backend       : macOS Keychain
  Friendly Name : My Laptop

Next steps:
  Target:     run `amesh listen`, then `amesh invite` from your controller
  Controller: run `amesh listen` on a target first, then `amesh invite` here
```

amesh uses hardware-backed key storage when available (Secure Enclave, macOS Keychain, or TPM 2.0). On machines without hardware key storage (cloud VMs, containers), the encrypted-file backend is selected automatically. You can also force it:

```bash
amesh init --name "prod-api" --backend encrypted-file
```

This creates two files:
- `~/.amesh/identity.json` — your device ID, public key, friendly name
- `~/.amesh/allow_list.json` — HMAC-sealed trust store (starts empty)

The private key is protected by the OS keychain (macOS), TPM (Linux), or encrypted with Argon2id (file backend). Hardware-backed keys never leave the secure element.

To use a custom directory (useful for testing):
```bash
AUTH_MESH_DIR=/tmp/my-test amesh init --name "Test Device"
```

---

## 3. CLI — List Trusted Devices

```bash
amesh list
```

Output (empty initially):
```
  This device
  ───────────────────────────────────────────────────────
  Device ID     : am_cOixWcOdI8-pLh4P
  Friendly Name : My Laptop
  Backend       : macOS Keychain
  Created       : 2026-03-30

  No trusted devices yet.
  Pair with another device using `amesh listen` + `amesh invite`.
```

After devices are paired, it shows each device's role (`[controller]` or `[target]`):
```
  This device
  ───────────────────────────────────────────────────────
  Device ID     : am_cOixWcOdI8-pLh4P
  Friendly Name : My Laptop
  Backend       : macOS Keychain
  Created       : 2026-03-30

  Trusted Devices (2)
  ───────────────────────────────────────────────────────
  am_1a2b3c4d5e6f7a8b  MacBook Pro — dev     [controller]   added 2026-03-28
  am_9f8e7d6c5b4a3210  staging-api           [target]       added 2026-03-29
  ───────────────────────────────────────────────────────
```

- **[controller]** — this device can authenticate TO you
- **[target]** — you can authenticate TO this device, but it cannot authenticate back to you

---

## 4. CLI — Revoke a Device

```bash
amesh revoke am_1a2b3c4d5e6f7a8b
```

Prompts for confirmation, then removes the device from the allow list and reseals the HMAC.

---

## 5. Use the Crypto Primitives Directly

Open a REPL from the core package:

```bash
cd packages/core
bun repl
```

### Sign and verify a message

```js
import { p256 } from '@noble/curves/nist.js';
import { signMessage, verifyMessage, buildCanonicalString } from './dist/index.js';

// Generate a keypair
const priv = p256.utils.randomSecretKey();
const pub = p256.getPublicKey(priv, true);

// Build a canonical string (simulates an HTTP request)
const canonical = buildCanonicalString(
  'POST', '/api/orders?b=2&a=1', '1743160800', 'myNonce', '{"amount":100}'
);
console.log(canonical);
// AMv1
// POST
// /api/orders?a=1&b=2       ← query params sorted automatically
// 1743160800
// myNonce
// 3d1a0f6c...               ← SHA-256 of body

// Sign and verify
const msg = new TextEncoder().encode(canonical);
const sig = signMessage(priv, msg);
console.log('Valid:', verifyMessage(sig, msg, pub));      // true
console.log('Tampered:', verifyMessage(sig, new TextEncoder().encode('wrong'), pub)); // false
```

### Simulate a full ECDH handshake

```js
import { generateEphemeralKeyPair, computeSharedSecret, deriveSessionKey } from './dist/index.js';

const target = generateEphemeralKeyPair();
const controller = generateEphemeralKeyPair();

// Both sides compute the same shared secret
const keyA = deriveSessionKey(computeSharedSecret(target.privateKey, controller.publicKey));
const keyB = deriveSessionKey(computeSharedSecret(controller.privateKey, target.publicKey));
console.log('Keys match:', Buffer.from(keyA).equals(Buffer.from(keyB))); // true
// This 32-byte key would encrypt the ChaCha20-Poly1305 tunnel
```

### Replay detection

```js
import { InMemoryNonceStore } from './dist/index.js';

const store = new InMemoryNonceStore();
console.log(await store.checkAndRecord('abc123', 60));  // true  — fresh nonce
console.log(await store.checkAndRecord('abc123', 60));  // false — replay!
```

---

## 6. Sign and Verify HTTP Requests (SDK)

This is the end-to-end flow that replaces API keys. The simplified SDK auto-loads your identity from `~/.amesh/`.

### Client side — sign outgoing requests

```js
import { amesh } from '@authmesh/sdk';

// Drop-in replacement for fetch() — signs every request automatically
const response = await amesh.fetch('http://localhost:3000/api/orders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ amount: 100 }),
});

console.log(await response.json());
// { message: 'Authenticated!', device: 'am_client1', name: 'Production API' }
```

### Server side — verify incoming requests

```js
import express from 'express';
import { amesh } from '@authmesh/sdk';

const app = express();
app.use(express.json());

// Works with express.json(), express.text(), or no body parser at all.
app.use(amesh.verify());

app.post('/api/orders', (req, res) => {
  // req.authMesh is populated after successful verification
  res.json({
    message: 'Authenticated!',
    device: req.authMesh.deviceId,
    name: req.authMesh.friendlyName,
  });
});

app.listen(3000);
```

For multi-instance deployments, pass a Redis-backed nonce store:

```js
import { RedisNonceStore } from '@authmesh/sdk/redis';

app.use(amesh.verify({
  nonceStore: new RedisNonceStore({ redisUrl: process.env.REDIS_URL }),
}));
```

The client automatically:
1. Builds the canonical string from the request
2. Signs it with the hardware-stored private key
3. Injects the `Authorization: AuthMesh v="1",id="...",ts="...",nonce="...",sig="..."` header

The server automatically:
1. Parses the header
2. Checks the device is in the allow list
3. Checks the device's role is `controller` (targets are rejected)
4. Validates timestamp (±30s), nonce (replay prevention)
5. Verifies the ECDSA-P256-SHA256 signature
6. Attaches `req.authMesh` with the verified device identity

**No API key. No Bearer token. No shared secret.**

---

## 7. Pair Two Devices (Trust Handshake)

The handshake establishes trust between two machines. Run it once per device pair — after that, all authentication is offline.

**Trust is one-way.** The controller (your laptop) can authenticate to the target (the server), but the target cannot authenticate back to the controller. This limits the blast radius of a compromised server.

On the **target** machine (the server being secured):
```bash
amesh listen
# ✔ "Dev Laptop" added as controller.
```

On the **controller** machine (your laptop), using the 6-digit code displayed by the target:
```bash
amesh invite 482916
# Waiting for target to confirm verification code...
# ✔ "prod-api" added as target.
```

The controller displays a 6-digit verification code — enter it on the target to confirm the pairing. The controller waits for confirmation before adding the device (no one-sided trust if the target rejects). After that:
- The target's allow list has the controller's key with role `controller` (accepts auth from it)
- The controller's allow list has the target's key with role `target` (cannot auth from it)

By default, a target allows only **one controller**. If you pair a second controller, the CLI prompts you to replace the existing one. To allow multiple controllers, use `amesh init --max-controllers N`.

To run the handshake as an integration test:
```bash
cd packages/relay
bun test
```

### Pairing Troubleshooting

**"Device already in allow list"**
The device was previously paired. The CLI will automatically update the existing entry with fresh handshake data. If you need to start clean, run `amesh revoke <device-id>` first.

**Pairing code expired**
Codes expire after 60 seconds. Run `amesh listen` again to generate a new code.

**SAS code mismatch**
The 6-digit verification code didn't match. This could indicate a MITM attack, or simply that the wrong code was entered. No changes were made — run `amesh listen` again to retry.

**One-sided trust (paired on one side but not the other)**
This can happen if one side crashed mid-pairing. Run `amesh list` on both machines. Revoke the stale entry with `amesh revoke <device-id>`, then re-pair.

**Can't run interactive commands on the target?**
Use `amesh provision` on the controller to generate a bootstrap token. Set `AMESH_BOOTSTRAP_TOKEN` on the target — pairing happens automatically. See [Integration Guide — Pairing Remote Machines](./integration-guide.md#pairing-remote-machines).

**Timed out waiting for the other device**
Both devices must be running and connected to the same relay. The default relay is `wss://relay.authmesh.dev/ws`. Use `--relay` to override on both sides.

---

## 8. Start the Relay Server

```bash
bunx @authmesh/relay
# Or from the monorepo:
cd packages/relay && bun run start
```

Health check: `curl http://localhost:3001/health`

---

## What the Authorization Header Looks Like

```http
POST /api/orders HTTP/1.1
Host: api.example.com
Content-Type: application/json
Authorization: AuthMesh v="1",id="A+B9pwI1/CGINmyozdPjmj0k6g2yXft4Y/TAUfUIBojH",ts="1743160800",nonce="dGVzdG5vbmNlMTIz",sig="MEUCIQDx...base64url..."

{"amount":100}
```

- `v` — Protocol version (always `"1"`)
- `id` — Base64 compressed P-256 public key (33 bytes)
- `ts` — Unix timestamp in seconds
- `nonce` — 16 random bytes, Base64URL-encoded
- `sig` — ECDSA-P256-SHA256 signature (r||s, 64 bytes), Base64URL-encoded

---

## Error Responses

| Status | Error | When |
|--------|-------|------|
| 400 | `missing_header` | No Authorization header |
| 400 | `malformed_header` | Header present but unparseable |
| 400 | `unsupported_version` | `v` is not `"1"` |
| 401 | `unauthorized` | Device not in allow list, clock skew, replay, or bad signature |
| 500 | `allow_list_integrity_failure` | HMAC check failed (possible file tampering) |

All 401 responses return `{"error":"unauthorized"}` — specific reason is logged server-side only (no oracle attacks).

---

## What's Not Yet Implemented

- **Secure Enclave with signed binary**: macOS uses software Keychain fallback until the native module is signed with an Apple Developer ID.
- **Fastify middleware**: Only Express/Connect middleware exists. Fastify verification plugin planned.
- **Noise Protocol Framework**: Current handshake is hand-rolled ECDH (see ADR-008). Migration to Noise planned.
- **Automatic revocation propagation**: Revoking a device must be done on each server individually.

See the [GitHub Issues](https://github.com/ameshdev/amesh/issues) for the full future work list.
