# amesh Protocol Specification
**Version:** 2.0.0
**Status:** MVP Build Spec (Revised — P-256 hardware-compatible architecture)
**Philosophy:** Device-bound identity. Zero static secrets. Peer-to-peer trust. No strings to steal.

---

## Table of Contents
1. [Why This Exists](#1-why-this-exists)
2. [Scope of This MVP](#2-scope-of-this-mvp)
3. [Technology Stack](#3-technology-stack)
4. [Repository Structure](#4-repository-structure)
5. [Phase 1 — Identity Generation](#5-phase-1--identity-generation-amesh-init)
6. [Phase 2 — The Trust Handshake](#6-phase-2--the-trust-handshake-amesh-invite)
7. [Phase 3 — The Wire Protocol](#7-phase-3--the-wire-protocol-signing)
8. [Phase 4 — Verification Middleware](#8-phase-4--verification-middleware)
9. [The Allow List — Integrity Protection](#9-the-allow-list--integrity-protection)
10. [The Relay Server](#10-the-relay-server)
11. [Key Storage — Tiered Fallback](#11-key-storage--tiered-fallback)
12. [Revocation](#12-revocation)
13. [Security Considerations](#13-security-considerations)
14. [Error Reference](#14-error-reference)
15. [Build Roadmap](#15-build-roadmap)
16. [Testing Strategy](#16-testing-strategy)
17. [What This MVP Does NOT Include](#17-what-this-mvp-does-not-include)

---

## 1. Why This Exists

Static API keys are glorified passwords stored in plaintext. They live in `.env` files, get committed to GitHub, get passed around in Slack, and when they leak — and they always leak — there is no audit trail, no revocation ceremony, and no cryptographic proof of who used them.

`amesh` replaces the static secret with a **device-bound cryptographic identity**. The private key is generated on the device and protected by the OS keychain (macOS) or TPM 2.0 (Linux). There is no string to steal. A server proves it is "itself" by signing requests with a key that never leaves the machine. With a code-signed binary on macOS, keys can be stored in the Secure Enclave for true hardware binding.

**Target user for this MVP:** A solo developer or small team running API servers or backend services who currently manages secrets in `.env` files and lives in fear of a GitHub leak.

---

## 2. Scope of This MVP

This document covers **one thing only**: replacing static API keys in M2M (Machine-to-Machine) authentication.

**In scope:**
- CLI tool (`amesh`) for developers
- Device-bound key generation (hardware upgrade path via Secure Enclave / TPM)
- Peer-to-peer trust handshake (invite ceremony)
- Request signing and verification
- Node.js/TypeScript SDK (signing client + verification middleware)
- Revocation

**Out of scope (future versions):**
- Consumer login / browser identity
- Social recovery / Shamir's Secret Sharing
- Biometric liveness checks
- Mobile apps
- Consumer-facing device mesh

---

## 3. Technology Stack

Every choice below is made for a reason. Do not substitute without understanding the tradeoff.

| Layer | Choice | Reason |
|---|---|---|
| **Language** | TypeScript (Bun 1.3+) | Strong crypto ecosystem, fast prototyping, first-class async |
| **CLI Framework** | `oclif` v4 | Industry-standard, supports plugin architecture, generates proper help docs, used by Heroku/Salesforce CLIs |
| **Crypto — Curves** | `@noble/curves` (P-256 ECDSA + P-256 ECDH) | Audited, zero-dependency, constant-time, actively maintained by Paulmillr. P-256 chosen for universal hardware support (Secure Enclave, TPM 2.0). Replaces `@noble/ed25519` which is incompatible with hardware security modules. |
| **Crypto — Hashes** | `@noble/hashes` (SHA-256, HKDF, HMAC) | Same author, same audit lineage. |
| **Crypto — Ciphers** | `@noble/ciphers` (ChaCha20-Poly1305) | Handshake tunnel encryption. Same ecosystem. |
| **Hardware — macOS** | Swift helper subprocess → Apple Security.framework | Direct Secure Enclave access via `SecKeyCreateRandomKey` with `kSecAttrTokenIDSecureEnclave`. Generates P-256 keys in hardware. `node-keytar` is deprecated (archived Dec 2022) and cannot access Secure Enclave — it is only a password store. |
| **Hardware — Linux** | `tpm2-tools` (subprocess via `execFile`) | Industry standard TPM 2.0 interface. P-256 universally supported. |
| **Hardware — Fallback** | Encrypted file (AES-256-GCM + Argon2id) | Automatic fallback. Passphrase auto-generated and stored in a **dedicated file** (`~/.amesh/.passphrase`, mode 0o400) separate from `identity.json`. Operators can relocate via `AMESH_PASSPHRASE_FILE` or supply via `AUTH_MESH_PASSPHRASE` env var. Legacy installs with the passphrase in `identity.json` are auto-migrated. For cloud VMs without hardware key storage. |
| **Relay Server** | Bun.serve() native | Zero deps — no Fastify, no ws. |
| **Allow List Storage** | JSON file + HMAC integrity seal | See Section 9 — the plaintext JSON without integrity protection is a critical vulnerability |
| **Package Manager** | Bun workspaces | Monorepo-friendly, fast installs, native test runner |
| **Testing** | `bun:test` | Native Bun test runner, same describe/it/expect API |
| **Build — CLI** | `bun build --compile` | Single-executable binary (~65MB) |
| **Build — Libraries** | `tsc -b` (project references) | Standard approach for npm-published packages, no bundler needed |
| **Linting** | `eslint` + `@typescript-eslint` + `prettier` | Non-negotiable for a security-critical codebase |

---

## 4. Repository Structure

Use a **Bun monorepo**. Every package is independently publishable.

```
amesh/
├── packages/
│   ├── core/                  # Shared crypto primitives (sign, verify, key derivation)
│   │   ├── src/
│   │   │   ├── crypto.ts      # P-256 ECDSA wrappers
│   │   │   ├── canonical.ts   # Canonical string builder
│   │   │   ├── nonce.ts       # Nonce store
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── keystore/              # Hardware key storage abstraction layer
│   │   ├── src/
│   │   │   ├── index.ts       # Unified interface — detects platform, selects driver
│   │   │   ├── drivers/
│   │   │   │   ├── secure-enclave.ts   # macOS
│   │   │   │   ├── tpm.ts              # Linux
│   │   │   │   └── tpm.ts              # TPM 2.0 (Linux)
│   │   └── package.json
│   │
│   ├── cli/                   # The `amesh` CLI tool
│   │   ├── src/
│   │   │   ├── commands/
│   │   │   │   ├── init.ts        # amesh init
│   │   │   │   ├── invite.ts      # amesh invite --code XXXXXX
│   │   │   │   ├── listen.ts      # amesh listen (run on target)
│   │   │   │   ├── list.ts        # amesh list (show whitelisted devices)
│   │   │   │   └── revoke.ts      # amesh revoke <device-id>
│   │   └── package.json
│   │
│   ├── sdk/                   # Node.js SDK for developers
│   │   ├── src/
│   │   │   ├── client.ts      # Signs outgoing requests
│   │   │   ├── middleware.ts  # Express/Fastify verification middleware
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── relay/                 # The stateless WebSocket relay server
│       ├── src/
│       │   ├── server.ts
│       │   └── session.ts
│       └── package.json
│
├── package.json              # workspaces config
└── turbo.json                 # Turborepo for parallel builds
```

---

## 5. Phase 1 — Identity Generation (`amesh init`)

### What it does
Creates the cryptographic identity root for this device. Run once per machine.

### Algorithm
- **Primitive:** P-256 (secp256r1) ECDSA
- **Key size:** 256-bit private key, 33-byte compressed public key (65-byte uncompressed)
- **Library:** `@noble/curves` (`p256` export)

> **Why P-256 instead of Ed25519:** Ed25519 is not supported by Apple's Secure Enclave (P-256 only) or most TPM 2.0 hardware. P-256 is the industry standard for device and hardware crypto — used by FIDO2, WebAuthn, and passkeys. This keeps the door open to true hardware binding (Secure Enclave, TPM) across platforms.

### Key storage requirement
The private key **MUST** be stored in a platform-protected keystore and never written to disk as plaintext. On macOS, keys are stored in the OS Keychain (or Secure Enclave with a code-signed binary). On Linux, TPM 2.0 is used. See Section 11 for the full fallback chain.

### Outputs
After `amesh init`, the following are written to `~/.amesh/`:

```
~/.amesh/
├── identity.json       # Contains: { deviceId, publicKey (Base64), friendlyName, createdAt, storageBackend }
├── allow_list.json     # Starts empty: { devices: [], hmac: "" }
└── config.json         # Protocol version, relay URL, local preferences
```

**`identity.json` example:**
```json
{
  "version": "2.0.0",
  "deviceId": "am_8f3a...",
  "publicKey": "Base64EncodedCompressedP256PublicKey==",
  "friendlyName": "prod-api-us-east-1",
  "createdAt": "2026-03-28T10:00:00Z",
  "storageBackend": "secure-enclave"
}
```

### The Device ID
```
deviceId = "am_" + Base64URL( SHA-256( compressedPublicKey ) ).slice(0, 16)
```
The prefix `am_` makes amesh IDs visually identifiable in logs.

### CLI output
```
$ amesh init --name "prod-api-us-east-1"

Generating P-256 keypair...

Detecting key storage backend:
  Secure Enclave    selected

Identity created.

  Device ID     : am_8f3a9b2c1d4e5f6a
  Public Key    : A+B9pwI1/CGINmyozdPj...
  Backend       : Secure Enclave
  Friendly Name : prod-api-us-east-1

Next steps:
  Target:     run `amesh listen`, then `amesh invite` from your controller
  Controller: run `amesh listen` on a target first, then `amesh invite` here
```

---

## 6. Phase 2 — The Trust Handshake (`amesh invite`)

### Overview
This is the "ceremony" that establishes trust between two devices. It runs **once** per device pair. After it completes, all future authentication is offline and peer-to-peer — the relay is never needed again.

### Roles
- **Target** (the server being secured): runs `amesh listen`
- **Controller** (the developer's laptop): runs `amesh invite --code XXXXXX`

### The Relay's Role
The relay is a **dumb message bus**. It sees only:
1. The 6-digit OTC used to match two peers
2. Encrypted blobs it cannot decrypt

It cannot see permanent public keys. It cannot see private keys. It stores nothing to disk.

### Full Handshake Flow

```
TARGET                          RELAY                       CONTROLLER
  |                               |                               |
  |-- (1) Connect (OTC: 482916) ->|                               |
  |<- (2) Ack: session open -------|                               |
  |                               |<- (3) Connect (OTC: 482916) --|
  |                               |-- (4) Peer found ------------>|
  |                               |                               |
  | <======= (5) ECDH P-256 Ephemeral Key Exchange (via relay) ========> |
  |                               |                               |
  | <======= (6) Encrypted channel established (ChaCha20-Poly1305) ======> |
  |                               |                               |
  |<- (7) { pubKey, friendlyName, timestamp, selfSig } -----------|
  |-- (8) { pubKey, friendlyName, timestamp, selfSig } ---------->|
  |                               |                               |
  |                               |                               |
  | <======= (9) SAS Verification (controller displays, target enters) ========> |
  |                               |                               |
  |-- (10) Disconnect ----------->|<- (10) Disconnect ------------|
  |                               |                               |
  | (11) Each side writes allow_list.json and seals HMAC          |
```

### Step-by-Step Detail

**Step 1 — Target generates OTC:**
```
OTC = crypto.randomInt(100000, 999999).toString()
```
6 digits. Valid for **60 seconds**. Displayed prominently in the terminal.

**Step 5 — ECDH Ephemeral Exchange:**
Both sides generate a **throwaway** P-256 keypair for this session only. They exchange public halves through the relay. The shared secret derived via ECDH never touches the relay. This ephemeral keypair is discarded after the ceremony.

```
sharedSecret = P256_ECDH(myEphemeralPrivKey, theirEphemeralPubKey)  // raw x-coordinate (32 bytes)
sessionKey = HKDF-SHA256(sharedSecret, salt="amesh-handshake-v1")
```

> **Note:** `sharedSecret` is the raw 32-byte x-coordinate of the ECDH result, per NIST SP 800-56A. Not the compressed point (which would include a 1-byte prefix).

**Step 6 — Encrypted channel:**
All subsequent messages over the relay are encrypted with `ChaCha20-Poly1305` using `sessionKey`. The relay sees ciphertext only.

**Step 7/8 — Permanent key exchange:**
Each side sends:
```json
{
  "publicKey": "Base64EncodedPermanentPubKey==",
  "friendlyName": "prod-api-us-east-1",
  "timestamp": "2026-03-28T10:05:00Z",
  "selfSig": "Base64EncodedSignature=="
}
```
`selfSig` is an ECDSA-P256-SHA256 signature over `(publicKey + friendlyName + timestamp)` made with the **permanent** private key. This proves the sender controls the private key corresponding to the public key they're presenting.

**Step 9 — SAS Verification (Short Authentication String):**
After both sides have exchanged permanent keys, each CLI computes a 6-digit verification code:
```
SAS = truncate(SHA-256(targetPubKey || controllerPubKey || sharedECDHSecret), 6 digits)
```
The **controller** displays the code. The **target** prompts the operator to enter the code shown on the controller's screen. The target verifies the entered code against its own computed SAS using a constant-time comparison. If they match, pairing proceeds. If they differ (indicating a MITM), pairing is aborted automatically.

This "code entry" approach (vs. visual comparison) eliminates the risk of a distracted operator rubber-stamping a mismatch. One-sided verification on the target is sufficient because the target's allow list is the security-critical one — it controls who may authenticate. Same cryptographic principle as Signal, Matrix, and Bluetooth Secure Simple Pairing.

> **Why SAS in addition to selfSig:** The `selfSig` alone does not prevent a relay MITM that performs separate ECDH with each side and substitutes its own permanent key with a valid selfSig. The SAS catches this because the ECDH shared secrets differ.

**Step 11 — Persistence with role assignment:**
Each device writes the other's `publicKey` and `friendlyName` into its local `allow_list.json` with a **role** field and reseals the HMAC. See Section 9.

- The **target** (ran `amesh listen`) writes the controller's key with `role: "controller"` — this peer may authenticate to me.
- The **controller** (ran `amesh invite`) writes the target's key with `role: "target"` — this peer may NOT authenticate to me.

This enforces **one-way trust**: controllers can authenticate to targets, but targets cannot authenticate back to controllers.

**Single-controller default:** By default, a target allows only one controller (`maxControllers: 1` in `identity.json`). If a target already has a controller and a new handshake completes, the CLI prompts the operator to replace the existing controller. The `maxControllers` limit can be raised via `amesh init --max-controllers N`.

### CLI output (Target side)
```
$ amesh listen

  Connecting to relay...
  
  ┌─────────────────────────────┐
  │   Your pairing code: 482916 │
  │   Expires in: 60 seconds    │
  └─────────────────────────────┘

  Share this code with your Controller device.

✔ Controller connected.
✔ Ephemeral P-256 ECDH tunnel established.
✔ Keys exchanged and verified.

  ┌──────────────────────────────────┐
  │   Enter the 6-digit code shown  │
  │   on the Controller's screen.   │
  └──────────────────────────────────┘

  Verification code: 847291

✔ "MacBook Pro — dev" added as controller.

  You can now use amesh signing. The relay connection is closed.
```

### CLI output (Controller side)
```
$ amesh invite 482916

  Connecting to relay with code 482916...

✔ Peer found.
✔ Ephemeral P-256 ECDH tunnel established.
✔ Keys exchanged and verified.

  ┌──────────────────────────────────┐
  │   Verification code: 847291     │
  │   Enter this code on the Target  │
  │   device to complete pairing.    │
  └──────────────────────────────────┘

✔ "prod-api-us-east-1" added as target.

  Pairing complete. The relay connection is closed.
```

---

## 7. Phase 3 — The Wire Protocol (Signing)

Every HTTP request from an `amesh`-enrolled device includes an ECDSA-P256-SHA256 signature in the `Authorization` header. There is no Bearer token. There is no secret. Signatures use raw `r || s` format (64 bytes fixed) instead of DER encoding.

### Canonical String Construction

Before signing, the client builds a deterministic string `M` from the request:

```
M = Version + "\n"
  + Method.toUpperCase() + "\n"
  + Path + "\n"
  + Timestamp + "\n"
  + Nonce + "\n"
  + HexEncode(SHA-256(RequestBody || ""))
```

**Rules:**
- `Version` is always `"AMv1"` for this spec. This enables future format negotiation.
- `Method` is uppercased: `GET`, `POST`, etc.
- `Path` includes query string, alphabetically sorted: `/api/data?b=2&a=1` → `/api/data?a=1&b=2`
- `Timestamp` is Unix timestamp in seconds as a string: `"1743160800"`
- `Nonce` is 16 cryptographically random bytes, Base64URL-encoded
- `RequestBody` is the raw request body bytes. For requests with no body (GET, DELETE), use empty string `""`
- Fields are joined with newline `\n`, no trailing newline

### The Authorization Header

```http
Authorization: AuthMesh v="1",id="<Base64URL_CompressedP256PubKey>",ts="<UnixTimestamp>",nonce="<Base64URL_16bytes>",sig="<Base64URL_ECDSA_P256_Signature_r||s>"
```

**Single line. No line breaks.** This avoids HTTP proxy compatibility issues with folded headers.

**Example:**
```http
Authorization: AuthMesh v="1",id="8f3a9b2c1d4e5f6a7b8c9d0e1f2a3b4c",ts="1743160800",nonce="dGVzdG5vbmNlMTIz",sig="BASE64URL_SIGNATURE_HERE"
```

**Parser invariants (L2).** A conforming parser MUST:
- Reject headers longer than 1024 characters.
- Reject duplicate keys (e.g. `v="1",v="2"`) — the whole header is invalid, not last-wins.
- Reject unknown keys — forward-compat is done via the `v=` field, not via adding arbitrary keys.
- Enforce per-field length caps: `v` ≤ 8, `ts` ≤ 16, `nonce` ≤ 64, `id` ≤ 128, `sig` ≤ 256.

The reference implementation lives in `packages/sdk/src/header.ts`.

### SDK — Client Usage

```typescript
import { AuthMeshClient } from '@authmesh/sdk';

const client = new AuthMeshClient({
  deviceId: 'am_8f3a9b2c1d4e5f6a',  // loaded from ~/.amesh/identity.json
});

// Works as a fetch wrapper
const response = await client.fetch('https://api.yourservice.com/data', {
  method: 'POST',
  body: JSON.stringify({ hello: 'world' }),
});
```

Internally, `client.fetch` builds `M`, signs it with ECDSA-P256-SHA256 using the hardware-stored private key, and injects the `Authorization` header before sending.

---

## 8. Phase 4 — Verification Middleware

### Express Middleware

```typescript
import { authMeshVerify } from '@authmesh/sdk/middleware';

app.use('/api', authMeshVerify({
  allowListPath: '~/.amesh/allow_list.json',  // default
  clockSkewSeconds: 30,                            // default
  nonceWindowSeconds: 60,                          // default
  maxBodyBytes: 1_048_576,                         // default (1 MiB)
}));
```

### Middleware ordering contract (M5)

`authMeshVerify` MUST hash the **raw bytes** of the request body, not a re-serialized projection of a parsed object. Any re-serialization would allow multiple byte sequences that parse to the same object to verify against the same signature (compatibility footgun + latent signature-relaxation bug).

Supported body sources, in priority order:

1. **`req.rawBody`** (Buffer or Uint8Array) — recommended when an upstream parser runs before `authMeshVerify`. Parsers like `express.json` expose a `verify` hook for exactly this purpose:
   ```typescript
   app.use(express.json({
     verify: (req, _res, buf) => { (req as any).rawBody = buf; }
   }));
   app.use('/api', authMeshVerify({ allowList }));
   ```
2. **`req.body` as Buffer** — e.g. `express.raw()`.
3. **`req.body` as string** — e.g. `express.text()`. Only safe for text bodies; non-UTF-8 bytes will be corrupted.
4. **No upstream parser** — `authMeshVerify` buffers the stream itself, enforcing `maxBodyBytes` (default 1 MiB), and caches both `req.rawBody` and `req.body` for downstream handlers.

If `req.body` is a parsed object with NO `req.rawBody`, the middleware returns **500 `body_parser_ordering_error`** rather than silently re-serializing. Mount `authMeshVerify` before body parsers, or configure your parser with a `verify` hook. A Content-Length header exceeding `maxBodyBytes` short-circuits to **413 `payload_too_large`**.

### Verification Algorithm (Sequential — fail fast)

**Step 1 — Parse header**
Extract `v`, `id`, `ts`, `nonce`, `sig` from the `Authorization` header.  
If any field is missing: return `400 Bad Request`.

**Step 2 — Version check**
If `v !== "1"`: return `400 Bad Request` with body `{"error": "unsupported_version"}`.

**Step 3 — Identity lookup**
Load and verify the integrity of `allow_list.json` (see Section 9).
If `id` is not in the allow list: return `401 Unauthorized`.
Do not reveal *why* — the response body is always `{"error": "unauthorized"}` for 401s.

**Step 3b — Directionality check**
If the matched device has `role: "target"`: return `401 Unauthorized`.
A device marked as `target` in the allow list is a peer that this device can authenticate *to*, not a peer that may authenticate *to this device*. The response body is the same generic `{"error": "unauthorized"}` — the rejection reason is logged server-side only.

**Step 4 — Clock check**
```
serverNow = Math.floor(Date.now() / 1000)
if (Math.abs(serverNow - parseInt(ts)) > 30) → 401
```
If clock skew exceeds 30 seconds: return `401 Unauthorized` with body `{"error": "timestamp_out_of_range"}`.  
Log a warning if skew is between 20–30 seconds (clock drift indicator).

**Step 5 — Nonce check (mandatory)**
Check `nonce` against the in-memory nonce store (a `Map<string, number>` of `nonce → expiry`).  
If `nonce` exists in the store: return `401 Unauthorized` with body `{"error": "replay_detected"}`.  
Add `nonce` to the store with expiry `serverNow + 60`.  
Purge expired entries on every check (or via a `setInterval` every 30 seconds).

```typescript
// Nonce store implementation
class NonceStore {
  private store = new Map<string, number>();

  check(nonce: string, now: number): boolean {
    this.purge(now);
    if (this.store.has(nonce)) return false; // replay
    this.store.set(nonce, now + 60);
    return true;
  }

  private purge(now: number) {
    for (const [n, expiry] of this.store) {
      if (expiry < now) this.store.delete(n);
    }
  }
}
```

> **Note:** For multi-instance deployments, the nonce store must be shared via Redis or a similar fast store. Document this limitation explicitly in the SDK readme.

**Step 6 — Reconstruct canonical string**
Build `M` from the incoming request using the same rules as Section 7.  
The body must be buffered before verification runs — middleware must read the raw body.

**Step 7 — Verify signature**
```
result = P256.verify(signature, M, publicKey)  // ECDSA-P256-SHA256, raw r||s format
if (!result) → 401 Unauthorized {"error": "invalid_signature"}
```

**Step 8 — Attach identity to request**
On success, attach the verified device identity to the request object:
```typescript
req.authMesh = {
  deviceId: 'am_8f3a9b2c1d4e5f6a',
  friendlyName: 'prod-api-us-east-1',
  verifiedAt: serverNow,
};
```
Call `next()`.

---

## 9. The Allow List — Integrity Protection

> **This is a critical security section. Read it carefully.**

The `allow_list.json` file is the local trust store. If an attacker can write to it, they can add their own public key and authenticate as a trusted device — without ever breaking the cryptography.

### The Fix: HMAC Integrity Seal

The allow list is **sealed** with an HMAC derived from the device's key material. Every read verifies the seal. Every write regenerates it.

### File Format

```json
{
  "version": "2.0.0",
  "devices": [
    {
      "deviceId": "am_1a2b3c4d5e6f7a8b",
      "publicKey": "Base64EncodedPublicKey==",
      "friendlyName": "MacBook Pro — dev",
      "addedAt": "2026-03-28T10:05:00Z",
      "addedBy": "handshake",
      "role": "controller"
    }
  ],
  "updatedAt": "2026-03-28T10:05:00Z",
  "hmac": "HMAC-SHA256 over DETERMINISTIC canonical JSON of {version, devices, updatedAt}"
}
```

**Canonical JSON for HMAC (L5).** The canonical serializer used for HMAC input MUST sort object keys lexicographically at every level, recurse into arrays in order, drop `undefined` fields (JSON semantics), and emit no whitespace. This makes the HMAC bind to the content, not the JavaScript insertion order. The reference implementation is `stableStringify` in `packages/keystore/src/allow-list.ts`.

Pre-L5 files sealed with `JSON.stringify` (insertion-order dependent) are accepted on read via a legacy-canonical fallback and automatically re-sealed with the deterministic form on next write.

The `role` field enforces trust directionality:
- `"controller"` — this peer may authenticate to me (accepted by verification middleware)
- `"target"` — this peer is a target I can authenticate to, but it may NOT authenticate to me (rejected by verification middleware)

Legacy allow lists without the `role` field are migrated on first read: missing roles default to `"controller"` (permissive, backwards-compatible). The HMAC is resealed after migration.

### HMAC Key Derivation

The HMAC key material is obtained via `KeyStore.getHmacKeyMaterial(deviceId)`:

The private key cannot be exported from hardware. A random 32-byte secret is generated once per device and stored in `<deviceId>.hmac` (mode `0600`) alongside the key. This secret is generated on first call and reused thereafter.

This means:
- The HMAC key never appears in the allow list file
- The HMAC secret is protected by file permissions (not hardware-bound; see Security Considerations)
- Tampering with `allow_list.json` is immediately detected on next read

### Read/Write Protocol

**On every read:**
1. Load the JSON file
2. Derive `hmacKey`
3. Compute HMAC over the canonical form of `{version, devices, updatedAt}`
4. Compare with stored `hmac`
5. If mismatch: **halt**, log `CRITICAL: allow_list integrity check failed`, refuse to process request

**On every write:**
1. Modify the `devices` array
2. Update `updatedAt`
3. Recompute HMAC
4. Write atomically (write to `.allow_list.tmp`, then rename — prevents partial writes)

---

## 10. The Relay Server

### Core Principle
The relay is a **dumb, stateless, ephemeral message bus**. It exists only to solve the initial key exchange problem — two machines that don't know each other's addresses need to find each other once. After the handshake, it is never used again for that device pair.

### What the relay MUST NOT do
- Store any message to disk
- Log public keys or device IDs
- Inspect message contents (all payloads are encrypted by Step 6 of the handshake)
- Maintain sessions longer than the handshake window (60 seconds max)

### Session Lifecycle

```
1. TARGET connects with OTC "482916"
   → Relay creates in-memory session: { otc: "482916", target: ws1, controller: null, expiresAt: now+60s }

2. CONTROLLER connects with OTC "482916"
   → Relay finds session, sets controller: ws2
   → Relay sends "peer_found" to both sides

3. Relay forwards encrypted messages between ws1 and ws2 (opaque blob forwarding only)

4. Either side sends "done" OR either side disconnects OR session expires
   → Relay deletes session from memory immediately
```

### Relay Does Not Authenticate Peers
The relay does not verify that peers are who they claim to be. That is handled by the `selfSig` in Step 7/8 of the handshake — the ECDH-encrypted channel is the relay's trust guarantee; the `selfSig` is the peer's identity guarantee.

### Relay API

```
WebSocket endpoint: wss://relay.amesh.dev/ws

Connect message (Target):
{ "type": "listen", "otc": "482916" }

Connect message (Controller):
{ "type": "connect", "otc": "482916" }

Server → Client:
{ "type": "peer_found" }
{ "type": "error", "code": "otc_not_found" | "otc_expired" | "peer_already_connected" }

Data forwarding (opaque):
{ "type": "data", "payload": "Base64EncodedEncryptedBlob" }

Termination:
{ "type": "done" }
```

### Relay Rate Limiting (mandatory)
The relay MUST enforce:
- Max 5 failed OTC `listen`/`connect` attempts per client IP per minute
- Max 10 `bootstrap_watch` registrations per client IP per minute (separate bucket)
- Max 5 failed attempts per OTC (then OTC is burned)
- Max 1 active connection per OTC
- Max 50,000 concurrent pairing sessions per relay instance (`session_store_full` → `relay_capacity`)
- Max 10,000 concurrent WebSocket connections per relay instance
- OTC session expires after 60 seconds

### Client IP extraction behind a reverse proxy (H1)

`srv.requestIP()` returns the **load balancer peer** on Cloud Run, nginx, Cloudflare, Istio, etc. — identical for every client — which collapses per-IP rate limiting into a global bucket. The relay MUST extract the real client IP from the left-most `X-Forwarded-For` entry when running behind a trusted proxy, and MUST NOT honour XFF on directly-exposed deployments (where clients could spoof the header to pick a rate-limit bucket).

The reference implementation reads `AMESH_TRUST_PROXY=1|true|yes` at startup. Operators deploying behind Cloud Run / nginx / any LB MUST set this env var; operators on directly-exposed relays MUST leave it unset.

### Bootstrap-token single-use enforcement (H4)

Bootstrap tokens declare `single_use: true` in their payload. The relay MUST track consumed `jti` values in an in-memory set with TTL ≥ `MAX_TTL + clock_skew` (25h in the reference implementation) and reject replayed `bootstrap_init` messages with `bootstrap_reject { error: "token_already_used" }`. The jti is burned on first `bootstrap_init` regardless of whether the downstream handshake completes (fail-safe). Persistence across relay restarts is a best-effort property, not a guarantee — operators deploying multi-instance or restart-prone relays should pin bootstrap issuance to a short TTL so replay windows stay tight.

### Bootstrap-watcher claim protection (M3)

`bootstrap_watch` is last-write-wins per jti, which used to let any client race-claim any jti and DoS pairing. The relay MUST:
- Reject `bootstrap_watch` when a healthy (readyState OPEN) watcher from a DIFFERENT socket already owns the jti (error `jti_already_watched`)
- Allow the same socket to re-register its own jti (reconnect idempotency)
- Rate-limit `bootstrap_watch` per IP
- Validate `jti` is a string of at most 128 characters

### Relay Deployment
- Deploy as a Docker container on Fly.io or Cloud Run (~$2/month, standard Bun.serve(), easy deploy)
- Set `AMESH_TRUST_PROXY=1` when running behind a load balancer or reverse proxy (see H1 above)
- The relay is stateless across process lifetime but keeps some in-memory state (sessions, consumed jtis) per instance — horizontal scaling needs either sticky sessions or a shared store (e.g. Redis) for consumed jtis; MVP is single-instance
- Log only: connection timestamps, OTC collision metrics, and rate-limit hits (not OTC values, not token payloads)
- Consider Cloudflare Durable Objects for cost optimization at scale (future)

---

## 11. Key Storage — Tiered Fallback

Every device goes through this decision tree at `amesh init`. The selected backend is stored in `identity.json` as `storageBackend`.

```
┌──────────────────────────────────────────────────────┐
│  Tier 1 — Is this macOS with Apple Silicon or T2?    │
│  → YES: Use Secure Enclave via Swift helper subprocess │
│         SecKeyCreateRandomKey + kSecAttrTokenID      │
│         SecureEnclave. P-256 key generated IN chip.  │
│         Private key NEVER leaves the Secure Enclave. │
└──────────────────┬───────────────────────────────────┘
                   │ NO
                   ▼
┌──────────────────────────────────────────────────────┐
│  Tier 2 — Is TPM 2.0 present and accessible?        │
│  (check: tpm2_getcap properties-fixed)               │
│  → YES: Use TPM 2.0 via tpm2-tools subprocess       │
│         (execFile, NOT exec — prevents shell inject) │
│         P-256 key generated IN TPM hardware.         │
└──────────────────┬───────────────────────────────────┘
                   │ NO
                   ▼
┌──────────────────────────────────────────────────────┐
│  Tier 3 — Encrypted file (automatic fallback)        │
│  Passphrase auto-generated, stored in identity.json  │
│  → AES-256-GCM + Argon2id, filesystem permissions    │
│  → Private key encrypted at rest, decrypted per-sign │
│  → WARNING printed: "software-protected"             │
└─────────────────────────────��────────────────────────┘
```

> **Why not keytar?** `node-keytar` was archived in December 2022 when GitHub shut down Atom. It receives no security patches and is only a password store (`getPassword`/`setPassword`) — it has no API for cryptographic key generation, signing, or Secure Enclave access. Do not use it.

### The Keystore Interface

The `@authmesh/keystore` package exposes one unified interface regardless of backend:

```typescript
interface KeyStore {
  generateAndStore(deviceId: string): Promise<{ publicKey: Uint8Array }>;  // compressed P-256 (33 bytes)
  sign(deviceId: string, message: Uint8Array): Promise<Uint8Array>;        // ECDSA raw r||s (64 bytes)
  getPublicKey(deviceId: string): Promise<Uint8Array>;                     // compressed P-256 (33 bytes)
  getHmacKeyMaterial(deviceId: string): Promise<Uint8Array>;               // 32-byte secret for allow list HMAC
  delete(deviceId: string): Promise<void>;
}
```

The private key **never leaves the KeyStore interface**. The `sign` method takes a message and returns an ECDSA-P256-SHA256 signature in raw `r || s` format (64 bytes) — the key itself is never returned.

---

## 12. Revocation

Revocation is immediate and local. There is no central revocation server to call.

### CLI

```
$ amesh revoke am_1a2b3c4d5e6f7a8b

  Device: MacBook Pro — dev
  Added:  2026-03-28

  Are you sure? This device will lose access immediately. (y/N): y

✔ am_1a2b3c4d5e6f7a8b removed from allow list.
✔ Allow list resealed.

  Revocation is effective immediately on this machine.
  If this device authenticates to other machines, revoke it there too.
```

### What revocation does
1. Removes the `deviceId` entry from `allow_list.json`
2. Reseals the HMAC
3. Future requests from that device receive `401 Unauthorized`

### What revocation does NOT do (MVP limitation)
- It does not propagate to other machines automatically
- If `prod-server-A` and `prod-server-B` both trust `compromised-laptop`, you must run `amesh revoke` on **both servers**
- A future version will add a revocation broadcast protocol

Document this limitation clearly in the CLI output and README.

### `amesh list`

```
$ amesh list

  This device
  ───────────────────────────────────────────────────────
  Device ID     : am_8f3a9b2c1d4e5f6a
  Friendly Name : prod-api-us-east-1
  Backend       : Secure Enclave
  Created       : 2026-03-28

  Trusted Devices (2)
  ───────────────────────────────────────────────────────
  am_1a2b3c4d5e6f7a8b  MacBook Pro — dev     [controller]   added 2026-03-28
  am_9f8e7d6c5b4a3210  prod-api-us-east      [target]       added 2026-03-29
  ───────────────────────────────────────────────────────
```

---

## 13. Security Considerations

### Clock Synchronization
The `±30 second` window requires server clocks to be within 30 seconds of real time. This is satisfied by NTP, which is enabled by default on all major cloud providers. The middleware SHOULD emit a warning log when a valid timestamp is within 5 seconds of the boundary (potential drift indicator).

### Multi-Instance Deployments
The in-memory nonce store does not survive process restarts and is not shared across instances. For multi-instance deployments:
- Use Redis for the nonce store (TTL-keyed set, `SET nonce EX 60 NX`)
- Document this requirement prominently in the SDK README
- The `authMeshVerify` middleware should accept a custom `nonceStore` adapter interface

### The Relay is a Single Point of Failure During Handshake Only
After the handshake, the relay is irrelevant to security. A relay outage prevents new device pairing but does not affect existing authenticated sessions. For MVP, this is acceptable. The relay should target 99.9% uptime — "five nines" is not an MVP requirement.

### Physical Possession Assumption
This protocol assumes: **if you have the device and can unlock it, you have the identity.** This is the same assumption made by passkeys, FIDO2, and hardware security keys. The protocol does not protect against physical device theft paired with a compromised OS. Recommend OS-level disk encryption (FileVault, LUKS) and screen lock.

### MITM Defense: `selfSig` + SAS Verification
The relay could theoretically swap ephemeral public keys during Step 5 to perform a MITM attack. Two layers of defense exist:

1. **`selfSig`** (Step 7/8): Proves each side controls the private key corresponding to the public key they present. A relay doing MITM cannot forge a `selfSig` for a key it doesn't control.

2. **SAS Verification** (Step 9): Even if the relay performs separate ECDH with each side and substitutes its own permanent key with a valid `selfSig`, the SAS codes will differ because the ECDH shared secrets differ. The target operator enters the code displayed on the controller — a mismatch is caught automatically via constant-time comparison, eliminating human error. Same cryptographic approach as Signal, Matrix, and Bluetooth Secure Simple Pairing.

### One-Way Trust Directionality
Trust between devices is **one-directional** by default. A controller can authenticate to a target, but the target cannot authenticate back to the controller. This limits the blast radius of a compromised target — even if an attacker gains control of the server, they cannot use its amesh identity to authenticate to the controller. The `role` field in each allow list entry is HMAC-sealed, so an attacker cannot flip a `"target"` role to `"controller"` without invalidating the HMAC.

By default, a target allows only **one controller** (`maxControllers: 1`). This can be increased via `amesh init --max-controllers N` for multi-operator environments.

### Query String Canonicalization
Sort query parameters alphabetically before including in canonical string `M`. This prevents the same request from having two valid signatures depending on parameter ordering. Use: `new URLSearchParams(url.search).sort().toString()`.

### Security audit — April 2026

A full external-pen-tester-style audit was performed on 2026-04-05 covering the crypto primitives, keystore, SDK middleware, relay, and agent/cli shell flows. All critical and high-severity findings have been fixed; the mediums and informational items have also landed in the same branch. Summary:

| Severity | Finding | Fix |
|---|---|---|
| Critical | **C1** — Shell handshake MITM via unbound `selfSig` | Transcript-bound signature: `selfSig` now covers `"amesh-shell-v1"` domain prefix + peer identity fields + `sha256(signerEph \|\| verifierEph)`. A MITM relay forwarding an encrypted identity envelope across two ECDH legs no longer produces a signature that verifies on the receiving leg. See Remote Shell Spec §7.1. |
| Critical | **C2** — Encrypted-file passphrase stored next to the key | Passphrase moved to a dedicated file (`~/.amesh/.passphrase`, mode 0o400) with legacy auto-migration. Preferred source is `AUTH_MESH_PASSPHRASE` env var so secrets can stay off disk. Operators can relocate via `AMESH_PASSPHRASE_FILE`. |
| High | **H1** — Rate limiter used LB peer IP | Relay extracts client IP from left-most `X-Forwarded-For` entry when `AMESH_TRUST_PROXY=1`, with bounded-format validation. |
| High | **H2** — Passphrase colocation (see C2) | — |
| High | **H3** — ShellCipher DoS via counter desync on injected frame | `recvCounter` now only advances after successful Poly1305 verification. |
| High | **H4** — Bootstrap token `single_use` not enforced | Relay keeps a 25h consumed-jti set; duplicate `bootstrap_init` is rejected with `token_already_used`. Payload `scope`/`single_use`/`alg`/`iat` are now enforced at decode time. |
| Medium | **M1** — Relay connection counter double-decrement | Rejected sockets marked via `ws.data.rejected`; `close()` handles the single decrement. |
| Medium | **M2** — SessionStore unbounded | 50,000-session cap with distinct `relay_capacity` error code. |
| Medium | **M3** — Bootstrap watcher race | `jti_already_watched` rejection + dedicated rate limiter + jti length cap. |
| Medium | **M4** — Agent listener leak + orphan bash on reconnect | `createMessageReader().dispose()` + outer-scope `activeSession` torn down on relay disconnect. |
| Medium | **M5** — Middleware re-serialized parsed bodies | Middleware now hashes raw bytes only (`rawBody` → Buffer → string → stream). Parsed-object bodies without `rawBody` return `500 body_parser_ordering_error`. |
| Medium | **M6** — Bootstrap token `iat`/`alg`/`scope`/`single_use` unchecked | `validateBootstrapToken` enforces all four invariants with distinct error codes. |
| Medium | **M7** — TPM driver returned wrong formats | `tpm2_sign --format=plain` with TPMT_SIGNATURE fallback parser; `pemToRaw` now properly decodes P-256 SubjectPublicKeyInfo into a 33-byte compressed point. |
| Low | **L2** — Auth header parser laxity | Reject duplicate keys, unknown keys, oversized headers, per-field length caps. |
| Low | **L3** — AgentStore pubkey compare not constant-time | Replaced with `constantTimeStringEqual`. |
| Low | **L4** — macOS DER parser had no bounds checks | Bounds-checked every field, rejected long-form lengths, enforced r/s ≤ 32 bytes. |
| Low | **L5** — Allow-list canonical JSON was insertion-order dependent | Deterministic `stableStringify` with recursive key sorting; legacy canonical accepted on read with auto re-seal. |
| Low | **L6** — Bootstrap ack message had no delimiter | Ack message now `"amesh-bootstrap-ack-v1\n" + pubB64 + "\n" + jti`. |

Regression tests for every fix ship in the same PR. The full audit report lives at `docs/security-audit-2026-04.md`.

---

## 14. Error Reference

| HTTP Status | Error Code | Meaning |
|---|---|---|
| `400` | `missing_header` | `Authorization` header absent |
| `400` | `malformed_header` | Header present but cannot be parsed (includes duplicate keys, unknown keys, oversized fields — see L2 in §13) |
| `400` | `unsupported_version` | `v` field is not `"1"` |
| `401` | `unauthorized` | `id` not in allow list |
| `401` | `timestamp_out_of_range` | Clock skew exceeds 30 seconds |
| `401` | `replay_detected` | Nonce was used previously |
| `401` | `invalid_signature` | Signature does not verify |
| `413` | `payload_too_large` | Request body exceeds `maxBodyBytes` (default 1 MiB) — M5 |
| `500` | `body_parser_ordering_error` | A body parser ran before `authMeshVerify` without preserving raw bytes — see M5 middleware ordering contract in §8 |
| `500` | `allow_list_integrity_failure` | HMAC check failed — possible tampering |
| `500` | `internal_error` | Catch-all for unexpected server-side failures |

Bootstrap token validation errors (returned from `validateBootstrapToken`, surfaced to bootstrap clients and logs):
| Error Code | Meaning |
|---|---|
| `invalid_token_format` / `invalid_token_type` / `unsupported_token_version` | Structural parse failure |
| `unsupported_token_alg` | Header `alg` is not `ES256` |
| `unsupported_token_scope` | Payload `scope` is not `peer:add` |
| `token_must_be_single_use` | Payload `single_use` is not `true` |
| `token_not_yet_valid` | Payload `iat` is in the future beyond 60s skew |
| `token_expired` | Payload `exp` is in the past |
| `invalid_signature` | Signature verification failed against the embedded controller pub |
| `token_already_used` | Returned by the relay when a `bootstrap_init` reuses a consumed `jti` (H4) |

All `401` responses return the same body to prevent oracle attacks:
```json
{ "error": "unauthorized" }
```
The specific error code is logged server-side but never returned to the client (exception: `timestamp_out_of_range` and `unsupported_version` may be returned to aid debugging). 400, 413, and 5xx responses DO include the specific code — these describe client/server misconfiguration, not verification state, so there's no oracle to leak.

---

## 15. Build Roadmap

### Week 1 — Core Primitives
**Goal:** All crypto is correct and tested before any other code is written.

- [ ] Bootstrap monorepo (`bun`, `turbo`, `bun:test`, `eslint`)
- [ ] `@authmesh/core`: implement `buildCanonicalString()`, `signMessage()`, `verifyMessage()`
- [ ] `@authmesh/core`: implement `NonceStore` class
- [ ] Write 100% unit test coverage for core — including edge cases: empty body, query string ordering, clock boundary conditions, replay attempts
- [ ] `@authmesh/keystore`: implement the `KeyStore` interface
- [ ] `@authmesh/keystore`: implement encrypted-file driver (runs everywhere, easiest to test)
- [ ] `@authmesh/keystore`: implement OS keyring driver (platform CLI: `security` on macOS, `secret-tool` on Linux)

**Exit criteria:** `bun:test` passes. P-256 ECDSA `signMessage` + `verifyMessage` round-trips. Nonce store correctly rejects replays.

---

### Week 2 — Hardware Drivers + CLI Skeleton
**Goal:** Keys live in hardware. CLI is functional on macOS and Linux.

- [ ] `@authmesh/keystore`: implement Secure Enclave driver (macOS) — Swift helper calling Security.framework
- [ ] `@authmesh/keystore`: implement TPM 2.0 driver (Linux) — tpm2-tools subprocess via execFile
- [ ] `@authmesh/keystore`: implement platform detection and fallback chain
- [ ] `@authmesh/cli`: scaffold with `oclif` — `init`, `list`, `revoke` commands (no relay yet)
- [ ] `allow_list.json` reader/writer with HMAC integrity seal
- [ ] End-to-end test: `init` → `list` → `revoke` on local machine

**Exit criteria:** On a macOS machine, `amesh init` stores the P-256 key in Secure Enclave. On a Linux machine with TPM, key is in TPM. `allow_list.json` HMAC check fails if file is manually edited.

---

### Week 3 — The Handshake
**Goal:** Two machines can establish trust.

- [ ] `@authmesh/relay`: build Fastify v5 + @fastify/websocket relay server
- [ ] `@authmesh/relay`: OTC session matching, message forwarding, expiry
- [ ] `@authmesh/cli`: implement `listen` command
- [ ] `@authmesh/cli`: implement `invite` command
- [ ] Implement P-256 ECDH ephemeral exchange + ChaCha20-Poly1305 tunnel
- [ ] Implement `selfSig` generation and verification (ECDSA-P256)
- [ ] Implement SAS verification display and confirmation
- [ ] Deploy relay to Fly.io (staging environment)
- [ ] Integration test: `init` on machine A + `init` on machine B → handshake → both appear in each other's `allow_list.json`

**Exit criteria:** Full handshake completes between two real machines on different networks. Relay log shows no plaintext keys.

---

### Week 4 — SDK + Real-World Test
**Goal:** A developer can replace a real API key with amesh.

- [ ] `@authmesh/sdk`: implement `AuthMeshClient` (fetch wrapper with signing)
- [ ] `@authmesh/sdk`: implement `authMeshVerify` Express middleware
- [ ] `@authmesh/sdk`: implement `authMeshVerify` Fastify middleware
- [ ] Write SDK README with "5-minute quickstart" guide
- [ ] Build demo: a simple Express API secured with amesh + a client calling it
- [ ] Recruit 5 developers. Give them only the README. Count how many complete the quickstart without asking for help.

**Exit criteria:** 4 of 5 developers complete the quickstart independently. Zero static secrets appear anywhere in the demo codebase.

---

## 16. Testing Strategy

### Unit Tests (bun:test)
- Every function in `@authmesh/core` has unit tests
- Nonce store: test insert, reject replay, expiry purge
- Canonical string: test all field combinations, empty body, sorted query params
- Allow list HMAC: test tamper detection, atomic write

### Integration Tests
- Full handshake between two local processes (uses macOS Keychain on CI)
- Full request → sign → verify cycle with Express middleware

### Hardware Tests (CI skip, run manually)
- Secure Enclave driver: macOS GitHub Actions runner
- TPM driver: dedicated Linux machine with TPM 2.0

### Adversarial Tests (write these before the code)
- Replay attack: same nonce twice → second request rejected
- Clock attack: `ts` = `now + 60` → rejected
- MITM: swap `id` in header but keep original `sig` → signature mismatch
- Tampered allow list: edit `allow_list.json` manually → HMAC check fails on next request
- Wrong body: sign request with body A, send body B → hash mismatch in canonical string → signature fails

---

## 17. What This MVP Does NOT Include

Be explicit with users and contributors about what is out of scope:

| Feature | Status | Notes |
|---|---|---|
| Consumer browser login | ❌ Out of scope | Future version — requires WebAuthn integration |
| Social recovery / Shamir's Secret Sharing | ❌ Out of scope | Correct solution to device loss, not needed for M2M MVP |
| Automatic revocation propagation | ❌ Out of scope | Must run `revoke` on each machine manually |
| Shared nonce store for multi-instance | ⚠️ Documented limitation | Use Redis adapter — interface is defined, adapter not built |
| Biometric liveness / human attestation | ❌ Out of scope | Only relevant for consumer identity |
| Mobile SDK | ❌ Out of scope | Android/iOS drivers exist in design, not built |
| Time-locked revocation (48hr window) | ❌ Out of scope | Relevant when consumer identity is added |

---

## Appendix A — Canonical String Test Vector

**Input:**
```
Method:    POST
Path:      /api/orders?b=2&a=1
Timestamp: 1743160800
Nonce:     dGVzdG5vbmNl
Body:      {"amount":100}
```

**Canonical String `M`:**
```
AMv1
POST
/api/orders?a=1&b=2
1743160800
dGVzdG5vbmNl
3d1a0f6c...  (SHA-256 hex of '{"amount":100}')
```

**Expected behavior:** A test that changes any single character in `M` must produce a signature that fails `verifyMessage()`. Write this as a parameterized test.

---

## Appendix B — Dependency Versions (Pin These)

```json
{
  "@noble/curves": "2.0.1",
  "@noble/hashes": "2.0.1",
  "@noble/ciphers": "2.1.1",
  "@oclif/core": "4.x",
  "fastify": "5.x",
  "@fastify/websocket": "11.x",
  "bun:test": "4.x"
}
```

Pin **exact versions** for crypto libraries (`@noble/*`). Use `^` only for tooling (eslint, prettier). A supply-chain attack on `@noble/curves` is catastrophic — pin exact versions and verify checksums in CI.

> **Removed:** `@noble/ed25519` (replaced by `@noble/curves`), `keytar` (deprecated, archived), `ws` (now internal to `@fastify/websocket`).

---

*End of amesh-spec-v2.0.md*
*Revised from v1.1.0: Ed25519→P-256 for hardware compatibility, keytar→Swift helper subprocess, added SAS verification, updated all dependency versions.*
*Next step: Create the monorepo, run `bun init`, and begin Week 1 tasks. The first PR should be nothing but `@authmesh/core` with 100% test coverage.*