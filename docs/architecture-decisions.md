# Architecture Decisions

Key decisions made during spec review and project bootstrap (March 2026). Each entry explains **what** was decided, **why**, and **what alternatives were rejected**.

---

## ADR-001: P-256 ECDSA instead of Ed25519

**Decision:** All device identity keys use NIST P-256 (secp256r1) with ECDSA signing.

**Why:** Ed25519 is not supported by Apple's Secure Enclave (P-256 only via `kSecAttrKeyTypeECSECPrimeRandom`) or most TPM 2.0 hardware (Ed25519 added in TPM spec revision 1.59+ but rarely implemented in physical chips). Since the core value proposition is hardware-bound identity, we must use a curve that hardware actually supports.

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
| 1 | macOS Secure Enclave | napi-rs → `SecKeyCreateRandomKey` + `kSecAttrTokenIDSecureEnclave` |
| 2 | Linux TPM 2.0 | `tpm2-tools` subprocess via `execFile` (not `exec`) |
| 3 | OS keyring fallback | `security` CLI (macOS) / `secret-tool` (Linux libsecret) |
| 4 | Encrypted file | AES-256-GCM + Argon2id via `@noble/hashes/argon2` + `@noble/ciphers` |

---

## ADR-004: SAS verification in handshake

**Decision:** Add a Short Authentication String (SAS) confirmation step after the ECDH key exchange.

**Why:** The spec's original `selfSig` alone does not prevent a relay MITM that performs separate ECDH with each side and substitutes its own permanent key + valid selfSig. SAS catches this because the ECDH shared secrets differ in a MITM scenario:

```
SAS = truncate(SHA-256(targetPubKey || controllerPubKey || sharedECDHSecret), 6 digits)
```

Both CLIs display this number; the developer confirms they match. Same approach as Signal, Matrix, Bluetooth Secure Simple Pairing. Skippable with `--no-verify` for headless/automated pairing.

---

## ADR-005: pnpm over bun

**Decision:** Use pnpm 10.x as the package manager.

**Why:** Bun installs are ~30x faster, but:
- Native module compilation (node-gyp for napi-rs addon) has known issues with Bun
- Binary lockfile is harder to audit — bad for security-critical projects
- pnpm's strict dependency isolation catches phantom dependency bugs

---

## ADR-006: Fastify v5 + @fastify/websocket

**Decision:** Use Fastify v5 (not v4) with `@fastify/websocket` for the relay server.

**Why:** Fastify v4 reached EOL June 30, 2025. `@fastify/websocket` wraps `ws` internally with route-level WebSocket handlers and TypeScript support, instead of using raw `ws` alongside Fastify.

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
**Decision:** Added `getHmacKeyMaterial(deviceId)` to the KeyStore interface. For encrypted-file, it decrypts the private key and derives via HKDF. For hardware keystores, a random 32-byte secret is stored in a file with 0600 permissions.

**Why:** The AllowList constructor parameter was named `privateKeyMaterial` but all callers were passing the public key (from `getPublicKey()`). Since the public key is in `identity.json`, any attacker with filesystem access could derive the HMAC key and forge the allow list. This was the most critical finding.

**Tradeoff for hardware backends:** The stored HMAC secret is file-permission-protected, not hardware-bound. A future improvement would store it in the Secure Enclave / TPM as a symmetric key.

### Bootstrap token embeds controller public key
**Decision:** Added `pub` field to bootstrap token payload containing the controller's compressed P-256 public key.

**Why:** The target was verifying the token signature against `controllerPubKey` received from the relay `bootstrap_ack` message. A MITM relay could generate its own keypair, re-sign the token, and send its own public key — verification would succeed. Now the controller's key is embedded in the signed token payload and used as the trusted verification key.

### File permissions on all sensitive writes
**Decision:** All `writeFile` calls for keys, identity, and allow list use `mode: 0o600`. All `mkdir` calls use `mode: 0o700`.

**Why:** Default umask (typically 0644) makes encrypted key files world-readable. Defense-in-depth even when encryption is strong.

### Relay hardening
**Decision:** Added per-OTC attempt tracking (max 10), WebSocket `maxPayload` (64KB), connection limit (10K), bootstrap watcher TTL and cleanup, message field whitelisting.

**Why:** The relay was vulnerable to distributed OTC brute-force (per-IP limiting only), memory exhaustion via large payloads or unlimited connections, and stale bootstrap watcher leaks.

### deviceId path traversal prevention
**Decision:** Validate deviceId against `/^[a-zA-Z0-9_-]+$/` in encrypted-file driver.

**Why:** `path.join(basePath, deviceId + ".key.json")` does not prevent `../` traversal. A malicious deviceId could write outside the keys directory.
