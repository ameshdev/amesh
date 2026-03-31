# Build Roadmap

## Phase 0 — Project Bootstrap [DONE]
- [x] Initialize git repo + pnpm monorepo
- [x] turbo.json, tsconfig.base.json, eslint, prettier
- [x] Scaffold packages: core, keystore, cli, sdk, relay
- [x] Revise spec v1.1.0 → v2.0.0 (P-256, no keytar, SAS, Fastify v5)
- [x] Verify `pnpm build`, `pnpm test`, `pnpm lint` pass clean

## Phase 1 — Core Crypto [DONE]
- [x] 84 tests, 100% coverage across all 6 core modules
- [x] Adversarial tests: replay, tamper, MITM, clock boundary, body swap
- [x] Spec Appendix A test vector verified

## Phase 2 — Keystore [DONE]
- [x] Encrypted-file driver (AES-256-GCM + Argon2id)
- [x] HMAC-sealed allow list (5 adversarial tamper tests)
- [x] Platform detection + fallback chain (hardware drivers stubbed)
- [x] 35 tests

## Phase 3 — CLI + Handshake [DONE]
- [x] CLI commands: init, list, revoke (oclif)
- [x] Relay server: Fastify v5 + @fastify/websocket, OTC, rate limiting
- [x] Full handshake: P-256 ECDH + ChaCha20-Poly1305 + selfSig + SAS
- [x] Integration test: end-to-end handshake between two processes
- [x] 5 integration tests

## Phase 4 — SDK [DONE]
- [x] AuthMeshClient — signing fetch wrapper
- [x] authMeshVerify — Express middleware (all 8 verification steps)
- [x] Header parser/builder
- [x] 19 tests covering happy path + all error codes + adversarial scenarios

**Total: 143 tests across all packages**

## Post-MVP: listen + invite CLI commands [DONE]
- [x] `amesh listen` — target side (OTC, ECDH handshake, SAS verification, add to allow list)
- [x] `amesh invite <code>` — controller side (connect, handshake, SAS, add to allow list)
- [x] Fixed init to store keys under real device ID
- [x] Shared loadContext() helper for all commands
- [x] Relay start script (`pnpm start` in relay package)
- [x] Value proposition doc (`docs/why-amesh.md`)

## Hardware Keystore Drivers [DONE]
- [x] macOS Keychain driver via Swift subprocess (tries Secure Enclave, falls back to software Keychain)
- [x] TPM 2.0 driver via tpm2-tools subprocess
- [x] Platform detection: macOS → Keychain, Linux → TPM, anywhere → encrypted file
- [x] Simplified SDK: `amesh.fetch()` and `amesh.verify()` — 2 lines each, auto-loads from ~/.amesh/

## Redis Nonce Store [DONE]
- [x] NonceStore interface (abstract, any backend)
- [x] InMemoryNonceStore (single-instance default)
- [x] RedisNonceStore via ioredis SET NX EX (multi-instance)
- [x] amesh.verify() accepts optional nonceStore, warns in production
- [x] 6 Redis integration tests (skipped without REDIS_URL)

## Automated Provisioning [DONE]
- [x] `amesh provision` — generates signed bootstrap tokens
- [x] `bootstrapIfNeeded()` — SDK auto-pairing for Lambda/Docker/K8s
- [x] Relay bootstrap message routing (watch/init/ack)
- [x] Bug fixes: double SHA-256, DER parsing, Apple high-S normalization, keyAlias

## Site & Docs Cleanup [DONE]
- [x] Removed Lambda use case (hardware-bound identity doesn't apply to ephemeral compute)
- [x] Updated guide.md: simplified SDK examples (`amesh.fetch`/`amesh.verify`), fixed NonceStore API, added CLI listen/invite docs
- [x] Updated "What's Not Yet Implemented" to reflect current state

## v0.1.0 Launch [DONE]
- [x] Renamed npm scope to `@authmesh`
- [x] LICENSE, README, CHANGELOG, per-package READMEs
- [x] GitHub Actions CI (Node 20/22, lint, test, build)
- [x] GitHub Actions npm publish on tag
- [x] Published 5 packages to npm (`@authmesh/core`, `keystore`, `sdk`, `cli`, `relay`)
- [x] Landing page deployed to Firebase Hosting (`authmesh.dev`)
- [x] Relay deployed to Cloud Run (`relay.authmesh.dev`)
- [x] Integration guide with 6 recipes + remote pairing docs
- [x] Self-hosting guide (Docker, Cloud Run, Fly.io, K8s, plain Node.js)
- [x] Dockerfile.relay + docker-compose.yml
- [x] CLI default relay URL: `wss://relay.authmesh.dev/ws`
- [x] Branch protection on main (PRs required)

## Security Hardening (PR #1) [DONE]
- [x] AllowList HMAC keyed from private key material (was using public key)
- [x] `KeyStore.getHmacKeyMaterial()` — HKDF-derived for encrypted-file, stored secret for hardware
- [x] Bootstrap token embeds controller public key (`pub` field) — prevents MITM relay
- [x] Hardware keystore bootstrap uses keyAlias instead of re-generating mismatched key
- [x] ECDH returns raw 32-byte x-coordinate per NIST SP 800-56A
- [x] File permissions 0o600/0o700 on all sensitive files
- [x] deviceId validated against path traversal
- [x] Bootstrap jti entropy 32→128 bits
- [x] Per-OTC brute-force tracking (max 10 per OTC)
- [x] Relay: maxPayload 64KB, connection limit 10K, bootstrap watcher TTL + cleanup
- [x] Nonce store bounded at 1M entries
- [x] Base64URL decoding fix in SDK middleware
- [x] Canonical string newline injection prevention
- [x] Error responses no longer leak `allow_list_integrity_failure`
- [x] TPM temp files use `crypto.randomUUID()` instead of `Math.random()`
- [x] Protocol spec, ADR-009, roadmap updated

## Homebrew + APT Distribution (PR #2) [DONE]
- [x] Node.js upgraded to 24 LTS across CI, Docker, and docs
- [x] Custom SEA entry point (`packages/cli/src/sea.ts`) — bypasses oclif filesystem discovery
- [x] esbuild bundler (`packaging/build-sea.mjs`) — 3.9MB minified single-file bundle
- [x] Node.js SEA binary tested locally (macOS arm64)
- [x] GitHub Actions matrix build: darwin-arm64, darwin-x64, linux-x64
- [x] Homebrew formula with platform-specific binary tarballs
- [x] nfpm config for `.deb` packages (standalone binary, no nodejs dep)
- [x] `HOMEBREW_TAP_TOKEN` secret configured
- [x] `ameshdev/homebrew-tap` repo created with `Formula/amesh.rb`

## Landing Page Redesign [DONE]
- [x] Full-width layout with alternating section backgrounds (was max-w-2xl / 672px)
- [x] Two-column hero with tabbed install CTA (Homebrew / npm / Binary) + before/after code demo
- [x] Comparison table: amesh vs API Keys vs mTLS vs Vault vs OAuth
- [x] 3-column feature grid with icon badges (6 features)
- [x] Two-column "How it works" (text + code side-by-side)
- [x] CLI demo with terminal chrome and tabbed commands
- [x] Bottom CTA section with install command + link cards
- [x] 4-column footer (Brand / Product / Resources / Use Cases)
- [x] GitHub Invertocat logo in nav and footer
- [x] Responsive mobile layout with clean nav

## Future
- [ ] Bootstrap `single_use` enforcement (persistent jti store on relay — Redis SET NX EX)
- [ ] TPM `pemToRaw` — parse ASN.1 DER to extract and compress EC point (currently returns ~91-byte DER)
- [ ] Hardware-backed HMAC key storage (Secure Enclave symmetric key / TPM HMAC key)
- [ ] Backend detection: warn or fail on silent downgrade from hardware to encrypted-file
- [ ] Secure Enclave with Apple Developer ID signed binary (currently falls back to software Keychain)
- [ ] Fastify verification plugin (in addition to Express middleware)
- [ ] Noise Protocol Framework migration (ADR-008)
- [ ] Automatic revocation propagation
