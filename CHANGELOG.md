# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.1] - 2026-03-30

### Security

- **AllowList HMAC** now derived from private key material (encrypted-file) or a stored random secret (hardware keystores), not the public key which was publicly known from `identity.json`.
- **Bootstrap token** embeds controller public key (`pub` field) — signature verified against trusted embedded key, not untrusted relay message.
- **ECDH shared secret** returns raw 32-byte x-coordinate per NIST SP 800-56A (was including compressed point prefix byte).
- **File permissions**: all sensitive files (keys, identity, allow list) written with `0o600`/`0o700`.
- **deviceId** validated against path traversal (`/^[a-zA-Z0-9_-]+$/`).
- **Bootstrap jti** entropy increased from 32 to 128 bits.
- **Relay hardening**: per-OTC brute-force tracking (max 10 per OTC), `maxPayload` 64KB, connection limit 10K, bootstrap watcher TTL + cleanup, message field whitelisting.
- **Nonce store** bounded at 1M entries to prevent memory exhaustion.
- **Base64URL** decoding fix in SDK middleware (was using plain base64).
- **Canonical string** rejects newlines in fields to prevent injection.
- **Error responses** no longer leak `allow_list_integrity_failure` to clients.
- **TPM temp files** use `crypto.randomUUID()` instead of `Math.random()`.
- **Hardware keystore bootstrap** uses `keyAlias` mapping instead of re-generating a mismatched keypair.
- **`authMeshVerify` middleware** now accepts custom `nonceStore` for multi-instance replay protection.

### Added

- `KeyStore.getHmacKeyMaterial(deviceId)` method on all keystore drivers.
- `OTCAttemptTracker` for per-OTC distributed brute-force protection.
- `nonceStore` option in `VerifyOptions` for `authMeshVerify` middleware.
- ADR-009 documenting all security hardening decisions.

## [0.1.0] - 2026-03-30

### Added

- **Core crypto** (`@authmesh/core`): P-256 ECDSA signing/verification, canonical request strings, nonce-based replay detection, HMAC integrity, HKDF key derivation, ECDH key exchange. 84 tests including adversarial scenarios (replay, tamper, MITM, clock boundary, body swap).
- **Key storage** (`@authmesh/keystore`): Secure Enclave (macOS), TPM 2.0 (Linux), OS keyring, and AES-256-GCM + Argon2id encrypted-file fallback. HMAC-sealed allow list with atomic writes. Platform auto-detection with fallback chain. 35 tests.
- **SDK** (`@authmesh/sdk`): `amesh.fetch()` signing client and `amesh.verify()` Express/Connect middleware. Authorization header parser/builder. Redis nonce store for multi-instance deployments. Bootstrap token support for automated provisioning. 25 tests.
- **CLI** (`@authmesh/cli`): `init`, `listen`, `invite`, `list`, `revoke`, `provision` commands via oclif v4. Full ECDH + ChaCha20-Poly1305 + SAS handshake over WebSocket.
- **Relay** (`@authmesh/relay`): Fastify v5 WebSocket relay for pairing handshakes. OTC session management, IP-based rate limiting (5 failures/min). Bootstrap message routing. 5 integration tests.
- **Protocol specification** v2.0.0 with full wire format, crypto details, and security model.
- **Documentation**: guide, architecture decisions (8 ADRs), hardware implementation details, Redis nonce adapter guide, automated provisioning guide, value proposition doc.
- **Demo**: working end-to-end example showing signed requests, body verification, and replay detection.

[0.1.1]: https://github.com/ameshdev/amesh/releases/tag/v0.1.1
[0.1.0]: https://github.com/ameshdev/amesh/releases/tag/v0.1.0
