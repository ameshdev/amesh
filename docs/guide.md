# amesh Guide

What you can do with amesh, step by step.

---

## 1. Run the Tests

```bash
pnpm install
pnpm build
pnpm test       # 143 tests across 5 packages
pnpm lint       # eslint + prettier check
```

---

## 2. CLI — Create a Device Identity

The `init` command generates a P-256 keypair and writes identity files to `~/.amesh/`.

```bash
# Using the encrypted-file backend (works on any machine)
AUTH_MESH_PASSPHRASE=your-secret-passphrase \
  node packages/cli/dist/index.js init --name "My Laptop"
```

Output:
```
Generating P-256 keypair...
⚠ Warning: Running in degraded security mode. Key is protected only by your passphrase.
Identity created.

  Device ID : am_cOixWcOdI8-pLh4P
  Public Key: A+B9pwI1/CGINmyozdPj...
  Backend   : encrypted-file
```

This creates three files:
- `~/.amesh/identity.json` — your device ID, public key, friendly name
- `~/.amesh/keys/<device-id>.key.json` — encrypted private key (AES-256-GCM + Argon2id)
- `~/.amesh/allow_list.json` — HMAC-sealed trust store (starts empty)

To use a custom directory (useful for testing):
```bash
AUTH_MESH_DIR=/tmp/my-test AUTH_MESH_PASSPHRASE=test123 \
  node packages/cli/dist/index.js init --name "Test Device"
```

---

## 3. CLI — List Trusted Devices

```bash
AUTH_MESH_PASSPHRASE=your-secret-passphrase \
  node packages/cli/dist/index.js list
```

Output (empty initially):
```
  No trusted devices yet.
  Run `amesh listen` to start pairing.

  Your identity: am_cOixWcOdI8-pLh4P (My Laptop)
```

After devices are paired, it shows:
```
  Trusted Devices (2)
  ───────────────────────────────────────────────
  am_1a2b3c4d5e6f7a8b  MacBook Pro — dev     added 2026-03-28
  am_9f8e7d6c5b4a3210  staging-api           added 2026-03-29
  ───────────────────────────────────────────────

  Your identity: am_cOixWcOdI8-pLh4P (My Laptop)
```

---

## 4. CLI — Revoke a Device

```bash
AUTH_MESH_PASSPHRASE=your-secret-passphrase \
  node packages/cli/dist/index.js revoke am_1a2b3c4d5e6f7a8b
```

Prompts for confirmation, then removes the device from the allow list and reseals the HMAC.

---

## 5. Use the Crypto Primitives Directly

Open a Node.js REPL from the core package:

```bash
cd packages/core
node --input-type=module
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
3. Validates timestamp (±30s), nonce (replay prevention)
4. Verifies the ECDSA-P256-SHA256 signature
5. Attaches `req.authMesh` with the verified device identity

**No API key. No Bearer token. No secret to leak.**

---

## 7. Pair Two Devices (Trust Handshake)

The handshake establishes trust between two machines. Run it once per device pair — after that, all authentication is offline.

On the **target** machine (the server being secured):
```bash
AUTH_MESH_PASSPHRASE=your-secret \
  node packages/cli/dist/index.js listen
```

On the **controller** machine (your laptop), using the 6-digit code displayed by the target:
```bash
AUTH_MESH_PASSPHRASE=your-secret \
  node packages/cli/dist/index.js invite 482916
```

Both sides display a verification code — confirm they match. After that, each machine has the other's public key in its allow list.

To run the handshake as an integration test:
```bash
cd packages/relay
pnpm test
```

---

## 8. Start the Relay Server

```bash
cd packages/relay
node -e "
import('./dist/index.js').then(async ({ createRelayServer }) => {
  const relay = await createRelayServer({ host: '0.0.0.0', port: 3001 });
  await relay.start();
  console.log('Relay listening on ws://0.0.0.0:3001/ws');
});
"
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

See `docs/roadmap.md` for the full future work list.
