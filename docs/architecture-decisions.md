# Architecture Decisions

Key decisions made during spec review and project bootstrap (March 2026). Each entry explains **what** was decided, **why**, and **what alternatives were rejected**.

---

## ADR-001: P-256 ECDSA instead of Ed25519

**Decision:** All device identity keys use NIST P-256 (secp256r1) with ECDSA signing.

**Why:** Ed25519 is not supported by Apple's Secure Enclave (P-256 only via `kSecAttrKeyTypeECSECPrimeRandom`) or most TPM 2.0 hardware (Ed25519 added in TPM spec revision 1.59+ but rarely implemented in physical chips). Since the upgrade path to hardware-bound identity (Secure Enclave, TPM) requires P-256, we must use a curve that hardware supports.

**Rejected alternatives:**
- Ed25519 everywhere, software-only on macOS → defeats the purpose of hardware binding
- Ed25519 + Secure Enclave P-256 wrapping key → adds complexity, Ed25519 key still in memory during signing
- Different curves per platform → complicates wire protocol, verification, and testing

**Impact:** P-256 is what FIDO2, WebAuthn, and passkeys use. Signature format: raw `r || s` (64 bytes fixed), not DER. This keeps signatures compact and deterministic like Ed25519.

---

## ADR-002: @noble/curves replaces @noble/ed25519

**Decision:** Use `@noble/curves` v2.0.1 for both P-256 ECDSA (signing) and P-256 ECDH (handshake key exchange).

**Why:** `@noble/ed25519` does not provide X25519/ECDH — only signing. Since we switched to P-256 (ADR-001), `@noble/curves` provides both `p256` ECDSA and ECDH from a single package. The noble v2 ecosystem (`@noble/curves` 2.0.1, `@noble/hashes` 2.0.1, `@noble/ciphers` 2.1.1) was a coordinated release on Aug 25, 2025.

**Noble v2 breaking changes discovered during bootstrap:**
- Import paths use `.js` suffix: `@noble/curves/nist.js`, `@noble/hashes/sha2.js`
- `p256.sign()` returns `Uint8Array` directly (compact r||s), not a `Signature` object
- `p256.utils.randomPrivateKey()` renamed to `randomSecretKey()`
- `hkdf()` requires `Uint8Array` for salt/info — no string params

---

## ADR-003: No keytar — custom native module for Secure Enclave

**Decision:** Replace `node-keytar` with a custom `napi-rs` native module that calls Apple's Security.framework directly.

**Why:** keytar was archived Dec 2022 (Atom shutdown). It receives no security patches. More critically, keytar is a **password store** (`getPassword`/`setPassword`) — it has zero API for cryptographic key generation, signing, or Secure Enclave token access. The spec's original claim that keytar provides Secure Enclave access was architecturally incorrect.

**Approach by tier:**
| Tier | Platform | Method |
|------|----------|--------|
| 1 | macOS Secure Enclave | Swift helper → `SecKeyCreateRandomKey` + `kSecAttrTokenIDSecureEnclave` |
| 2 | macOS Keychain | Swift helper → software keychain (unsigned binary fallback) |
| 3 | Linux TPM 2.0 | `tpm2-tools` subprocess via `execFile` (not `exec`) |

Note: The encrypted-file fallback (Tier 3) is always available as an automatic fallback for cloud VMs and containers without hardware key storage. The passphrase is auto-generated (256-bit random) and stored in `identity.json`. Hardware backends are always preferred when available.

---

## ADR-004: SAS verification in handshake

**Decision:** Add a Short Authentication String (SAS) confirmation step after the ECDH key exchange.

**Why:** The spec's original `selfSig` alone does not prevent a relay MITM that performs separate ECDH with each side and substitutes its own permanent key + valid selfSig. SAS catches this because the ECDH shared secrets differ in a MITM scenario:

```
SAS = truncate(SHA-256(targetPubKey || controllerPubKey || sharedECDHSecret), 6 digits)
```

The controller CLI displays this code; the target CLI prompts the operator to enter it. The target verifies the entered code using constant-time comparison — a mismatch aborts pairing automatically, eliminating the risk of a distracted operator rubber-stamping a visual comparison. One-sided verification on the target is sufficient because the target's allow list is the security-critical one (it controls who may authenticate). Same cryptographic approach as Signal, Matrix, Bluetooth Secure Simple Pairing.

---

## ADR-005: Bun as runtime and package manager

**Decision:** Use Bun for package management, test runner (`bun:test`), CLI binary compilation (`bun build --compile`), and relay server runtime (`Bun.serve()`).

**Why:** The project has zero native addons (all crypto via pure-JS `@noble/*`), eliminating Bun's node-gyp concern. Bun provides faster installs, a built-in test runner with the same `describe/it/expect` API, and `bun build --compile` produces ~65MB binaries (vs ~123MB with Node.js SEA). The relay runs on `Bun.serve()` with zero framework deps.

**Supersedes:** Original decision was pnpm over Bun due to native module and lockfile audit concerns. Both are no longer relevant — no native modules exist, and `bun.lock` supports text format.

---

## ADR-006: Bun.serve() for relay

**Decision:** Use `Bun.serve()` native HTTP + WebSocket server for the relay.

**Why:** Zero dependencies — no Fastify, no `ws`. Bun's built-in WebSocket support handles upgrade, message routing, and backpressure natively. Eliminates 62 transitive deps from the relay package.

---

## ADR-007: Relay rate limiting on OTC

**Decision:** The relay MUST enforce rate limiting on OTC attempts.

**Why:** 6-digit OTC has 1-in-a-million collision chance per attempt. Without rate limiting, an attacker could brute-force OTC sessions.

**Rules:**
- Max 5 failed OTC attempts per IP per minute
- Max 1 active connection per OTC
- OTC session destroyed immediately on mismatch

---

## ADR-008: Hand-rolled ECDH (not Noise framework) for MVP

**Decision:** Use hand-rolled P-256 ECDH + HKDF + ChaCha20-Poly1305 for the handshake tunnel.

**Why:** Pragmatic MVP choice. The construction mirrors TLS 1.3's cipher suite and is well-understood.

**Technical debt:** The Noise Protocol Framework (Noise_NN pattern) has formal security proofs. Consider migrating before production release. Document as planned improvement.

---

## ADR-009: Security hardening (post-v0.1.0 audit)

**Decision:** Multiple security fixes applied after a full audit of all 5 packages on 2026-03-30.

### ECDH shared secret extraction
**Decision:** `computeSharedSecret()` returns the raw 32-byte x-coordinate, not the 33-byte compressed point.

**Why:** NIST SP 800-56A specifies extracting just the x-coordinate. The compressed point prefix byte (0x02/0x03) is not uniformly distributed and leaks information about y-coordinate parity. While HKDF hashes it away in practice, the standard extraction is correct.

### AllowList HMAC keyed from `getHmacKeyMaterial()`, not public key
**Decision:** Added `getHmacKeyMaterial(deviceId)` to the KeyStore interface. A random 32-byte secret is stored in a file with 0600 permissions per device.

**Why:** The AllowList constructor parameter was named `privateKeyMaterial` but all callers were passing the public key (from `getPublicKey()`). Since the public key is in `identity.json`, any attacker with filesystem access could derive the HMAC key and forge the allow list. This was the most critical finding.

**Tradeoff for hardware backends:** The stored HMAC secret is file-permission-protected, not hardware-bound. A future improvement would store it in the Secure Enclave / TPM as a symmetric key.

### Bootstrap token embeds controller public key
**Decision:** Added `pub` field to bootstrap token payload containing the controller's compressed P-256 public key.

**Why:** The target was verifying the token signature against `controllerPubKey` received from the relay `bootstrap_ack` message. A MITM relay could generate its own keypair, re-sign the token, and send its own public key — verification would succeed. Now the controller's key is embedded in the signed token payload and used as the trusted verification key.

### File permissions on all sensitive writes
**Decision:** All `writeFile` calls for keys, identity, and allow list use `mode: 0o600`. All `mkdir` calls use `mode: 0o700`.

**Why:** Default umask (typically 0644) makes encrypted key files world-readable. Defense-in-depth even when encryption is strong.

### Relay hardening
**Decision:** Added per-OTC attempt tracking (max 5), WebSocket `maxPayload` (64KB), connection limit (10K), bootstrap watcher TTL and cleanup, message field whitelisting. OTC sessions expire after 60 seconds.

**Why:** The relay was vulnerable to distributed OTC brute-force (per-IP limiting only), memory exhaustion via large payloads or unlimited connections, and stale bootstrap watcher leaks.

### deviceId path traversal prevention
**Decision:** Validate deviceId against `/^[a-zA-Z0-9_-]+$/` in all keystore drivers.

**Why:** `path.join(basePath, deviceId + ".key.json")` does not prevent `../` traversal. A malicious deviceId could write outside the keys directory.

---

## ADR-010: One-way trust directionality

**Decision:** Trust between paired devices is one-way. A controller can authenticate to a target, but the target cannot authenticate back to the controller. By default, a target allows only one controller.

**Why:** In the original symmetric design, both devices added each other's keys to their allow lists identically. This meant a compromised server could authenticate to the controller (e.g., the developer's laptop). One-way trust limits the blast radius: even if an attacker gains control of a target, they cannot use its identity to call back to controllers.

**Implementation:**
- Each `AllowListDevice` entry has a `role` field: `"controller"` or `"target"`
- During handshake, the target (runs `amesh listen`) records the peer as `role: "controller"`, and the controller (runs `amesh invite`) records the peer as `role: "target"`
- The verification middleware rejects requests from devices with `role: "target"` — they are peers you can authenticate TO, not peers that can authenticate TO you
- The `role` field is covered by the HMAC seal, so an attacker cannot flip it without invalidating the integrity check
- `maxControllers` in `identity.json` (default: 1) limits how many controllers a target accepts. Configurable via `amesh init --max-controllers N`

**Rejected alternatives:**
- One-way key exchange (target stores controller key only, controller stores nothing) — breaks `amesh list` and revocation on the controller side
- Role in `identity.json` (device is always controller or always target) — too rigid; the same device might be a controller for some peers and a target for others
- No enforcement (application-level convention) — convention is not security; the middleware must enforce it

**Trade-offs:** Bidirectional auth between two services requires two separate pairings (each side runs `amesh listen` once and `amesh invite` once). This is intentional friction — bidirectional trust should be a conscious choice, not the default.

---

## ADR-011: Remote shell in the CLI with explicit shell permission

**Decision:** The remote shell feature is part of `@authmesh/cli` — one package, one binary. `amesh shell` connects to a remote target. `amesh agent start` runs the daemon. Shell access requires explicit `amesh grant --shell` after pairing.

**Why:**

1. **One install:** Developers install one thing (`@authmesh/cli`) and get everything — identity management, pairing, API auth, shell client, and agent daemon.

2. **Explicit consent:** Pairing for API authentication (`amesh invite`) does not grant shell access. A `permissions.shell` flag in the allow list defaults to `false`. The target admin must explicitly run `amesh grant <device-id> --shell`. This is the security boundary, not the package boundary.

3. **The daemon is opt-in by invocation:** `amesh agent start` must be explicitly run. It doesn't auto-start, doesn't install as a service, and refuses to run as root without `--allow-root`.

**Security design choices:**

- **Incrementing nonce counters** (not random) for shell encryption — eliminates birthday-bound collision risk over long sessions
- **Device-ID-bound HKDF** (`amesh-shell-v1` salt + both device IDs) — cryptographic separation from pairing sessions
- **No session resumption** — dropped connection = full new ECDH handshake
- **Authenticated agent registration** — relay stores public key, controllers must match it (prevents squatting)
- **Uniform relay responses** — no `agent_not_found` message (prevents device enumeration)
- **Root guard** — agent refuses `root` without `--allow-root`
- **Per-controller session limits** — prevents DoS by authorized-but-misbehaving peers

**Rejected alternatives:**
- Separate `@authmesh/agent` package — adds install confusion without meaningful security benefit; the permission gate (`amesh grant --shell`) is the real security boundary, not the package boundary
- Auto-granting shell on pairing — violates principle of least privilege
- Reusing pairing handshake's random-nonce encryption — birthday-bound risk over long sessions
- Session resumption — complexity and nonce-reuse risk outweigh the latency benefit

---

## ADR-010: Auto-generated passphrase stored in identity.json

**Decision:** The encrypted-file backend auto-generates a 256-bit random passphrase and stores it in `identity.json` alongside the device identity. The `--passphrase` CLI flag has been removed.

**Why:** The previous model required users to provide and manage a passphrase (via `--passphrase` flag or `AUTH_MESH_PASSPHRASE` env var). This was the #1 onboarding friction point: users forgot passphrases, used weak ones, or had to manage env vars across machines. In practice, the passphrase was often stored in a `.env` file or systemd unit alongside the identity — offering no real second-factor benefit.

**Security model change:** The encrypted-file backend's security now depends on Unix file permissions (`identity.json` is mode `0o600` in a `0o700` directory) rather than encryption + separate passphrase. The Argon2id + AES-256-GCM encryption layer is retained as defense-in-depth (protects against partial file reads, memory forensics of swap/core dumps, and accidental backups of the key file without the identity file).

**Threat analysis:**
- **Same-user access:** Unchanged — the user who owns `~/.amesh/` can always access their own keys
- **Root compromise:** Unchanged — root can read everything regardless
- **Backup leak of `~/.amesh/`:** Slightly weaker — backup now contains both passphrase and encrypted key. Previously, the passphrase might have been stored separately. Mitigation: users should exclude `~/.amesh/` from backups, same as SSH keys.
- **Key file leak without identity file:** Still protected — the encryption is meaningful if only `keys/*.key.json` leaks without `identity.json`

**Backwards compatibility:** Existing identities created before this change (without a `passphrase` field in `identity.json`) still work via the `AUTH_MESH_PASSPHRASE` env var fallback.

**Memory hygiene:** The passphrase is stripped from the in-memory `Identity` object immediately after the `KeyStore` is created (`delete identity.passphrase`). JavaScript strings are immutable so a copy may remain in the V8/JSC heap, but this reduces the reference window.
