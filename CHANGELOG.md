# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.5.0] - 2026-04-05

Full external-pen-tester-style security audit. All findings (2 critical, 4 high, 7 medium, 5 low) are fixed in this release. ~140 new regression tests, 301 pass / 0 regressions in the source test suite. Full writeup in `docs/security-audit-2026-04.md`.

### Security

- **C1 — Shell handshake MITM via unbound `selfSig` (CRITICAL).** The shell handshake's `selfSig` covered only `pub + name + timestamp`, not the ECDH ephemeral keys. A compromised relay (explicitly in-threat-model) could decrypt one leg's encrypted identity envelope and re-encrypt it onto the other leg, producing a signature that verified on both sides while the relay held the session key. `selfSig` is now bound to a `sha256(signerEphPub || verifierEphPub)` transcript under the `amesh-shell-v1` domain prefix. See `docs/remote-shell-spec.md §7.1`.
- **C2 / H2 — Encrypted-file passphrase stored next to the encrypted key (CRITICAL).** The auto-generated passphrase was written into `~/.amesh/identity.json` in the same directory as `~/.amesh/keys/<deviceId>.key.json`, making the Argon2id layer cosmetic against any filesystem-read adversary. Passphrase now lives in a dedicated `~/.amesh/.passphrase` file (mode `0o400`) with `AMESH_PASSPHRASE_FILE` override and `AUTH_MESH_PASSPHRASE` env-var override. Legacy installs auto-migrate on first read with a one-time warning log.
- **H1 — Relay rate limiter used load-balancer IP (HIGH).** `Bun.serve().requestIP()` returns the LB peer on Cloud Run / nginx / Cloudflare, collapsing all clients into a global 5/min bucket. Relay now extracts the left-most `X-Forwarded-For` entry when `AMESH_TRUST_PROXY=1|true|yes`, with strict IP format validation. **Operator action required:** set `AMESH_TRUST_PROXY=1` in your Cloud Run service config.
- **H3 — ShellCipher DoS via counter desync on injected frame (HIGH).** `ShellCipher.decrypt()` advanced `recvCounter` before Poly1305 verification, so a single junk frame from an untrusted relay permanently killed every shell session. Counter now only advances after successful AEAD verification.
- **H4 — Bootstrap token `single_use` not enforced (HIGH).** Payload claimed `single_use: true` but no code path tracked consumed `jti`s. Relay now keeps a 25h consumed-jti set and rejects replayed `bootstrap_init` with `bootstrap_reject { error: "token_already_used" }`. Fail-safe: jti is burned on first init even if downstream bootstrap fails.
- **M1 — Relay connection counter double-decrement (Medium).** Overflow rejection decremented both in `open()` AND the subsequent `close()`, letting `connectionCount` drift negative and silently bypass `MAX_CONNECTIONS`. Rejected sockets now set `ws.data.rejected` and leave decrementing to `close()`.
- **M2 — SessionStore unbounded (Medium).** 50,000-session cap with distinct `relay_capacity` error code (separate from `otc_in_use`). Configurable via `createRelayServer({maxSessions})`.
- **M3 — Bootstrap watcher race / DoS (Medium).** `bootstrap_watch` was last-write-wins; an attacker could continuously hijack legitimate watchers. Now rejects claims from different sockets while a healthy watcher holds the jti (`jti_already_watched`), has its own 10/min/IP rate limiter, and validates jti length.
- **M4 — Agent listener leak + orphan bash on reconnect (Medium).** `createMessageReader` now exposes `dispose()`; agent daemon tracks an `ActiveSession` in outer scope and tears down (kill proc, clear timer, close cipher) on relay disconnect. Previously the bash process orphaned and `sessionActive` stayed true until idle timeout.
- **M5 — Middleware body re-serialization (Medium).** `authMeshVerify` previously called `JSON.stringify(req.body)` when `express.json()` had already parsed the body, hashing something different from the client's signed bytes. Middleware now hashes raw bytes only: `req.rawBody` → `Buffer` → string → stream buffer. A parsed-object `req.body` with no `rawBody` is now a hard `500 body_parser_ordering_error` — mount `authMeshVerify` before parsers or use a `verify` hook. See `docs/protocol-spec.md §8` for the new ordering contract.
- **M6 — Bootstrap token missing `iat`/`alg`/`scope`/`single_use` checks (Medium).** `validateBootstrapToken` now enforces all four with distinct error codes.
- **M7 — TPM driver returned wrong formats (Medium).** `tpm2_sign` now passes `--format=plain` (with a TPMT_SIGNATURE fallback parser for tpm2-tools 4.x); `pemToRaw` properly decodes SubjectPublicKeyInfo into a 33-byte compressed P-256 point via a bounded DER walker.
- **L2 — Auth header parser laxity (Low).** Reject duplicate keys, unknown keys, oversized headers (>1024 chars), per-field length caps.
- **L3 — `AgentStore` pubkey compare (Low).** Replaced `!==` with `constantTimeStringEqual` in `register()` and `matchAndGet()`.
- **L4 — macOS DER parser bounds checks (Low).** Every field access now bounds-checked, long-form lengths rejected, r/s length ceilings enforced.
- **L5 — Allow-list canonical JSON (Low).** HMAC input now computed via `stableStringify` (recursive key sort) instead of `JSON.stringify`. Pre-L5 files accepted via legacy-canonical fallback with auto re-seal on next write.
- **L6 — Bootstrap ack delimiter (Low).** Ack message now `"amesh-bootstrap-ack-v1\n" + pubB64 + "\n" + jti` with explicit delimiters and domain prefix.

### Operator actions required when deploying this release

1. **Set `AMESH_TRUST_PROXY=1`** on relays running behind a reverse proxy / load balancer. Without this, H1 is inert and per-IP rate limiting remains broken.
2. **Audit middleware ordering.** If you run `authMeshVerify` alongside a body parser like `express.json()`, either put `authMeshVerify` first or add a `verify` hook that populates `req.rawBody`. Otherwise requests will start returning `500 body_parser_ordering_error`. See `docs/protocol-spec.md §8`.
3. **Watch for one-time passphrase migration log.** Existing encrypted-file installs will print `[amesh] migrated legacy passphrase from identity.json to dedicated file` once on next load. Verify the `passphrase` field is gone from `identity.json` afterwards.

## [0.4.0] - 2026-04-05

### Added

- **Prebuilt `amesh-agent` binaries** for macOS arm64/x64 and Linux x64/arm64, built by the release pipeline and shipped in the same `amesh-{version}-{platform}-{arch}.tar.gz` tarball as the main `amesh` binary. Fixes the "install fails on every platform" issue — `npm install -g @authmesh/agent` and `brew install ameshdev/tap/amesh` now both produce a working `amesh-agent` without the `bun $(which amesh-agent) ...` wrapper. Raspberry Pi 3 and earlier (armv7, 32-bit Pi OS) remain unsupported because Bun itself does not ship for that architecture.
- **`linux-arm64` target** added to the release matrix (cross-compiled from `ubuntu-latest` via Bun's `--target` flag). Unblocks Raspberry Pi 4/5 on 64-bit Pi OS and ARM cloud VMs.
- **npm postinstall binary downloader** (`packages/agent/scripts/postinstall.mjs`) detects host platform and arch, downloads the matching prebuilt binary from the GitHub release, extracts it into `node_modules/@authmesh/agent/bin/amesh-agent`, and chmods it executable. Unsupported architectures (e.g. armv7) get a clear "install Bun and use wrapper" message and a graceful exit-0 so `npm install` never fails.
- **Launcher script** (`packages/agent/scripts/launcher.mjs`) — the new `bin` entry that execs the prebuilt binary when present and falls back to the JS oclif entry otherwise. Same pattern esbuild/swc use.
- **Compiled-binary entry point** for the agent (`packages/agent/src/sea.ts`) — mirrors `packages/cli/src/sea.ts` with explicit nested-command dispatch for `amesh-agent agent start` since the CLI sea.ts only handled top-level commands.
- **Docs IA restructure (vite.dev / bun.com style)** on the landing page: nested sidebar sections (Introduction / Getting Started / Guides / Reference / Packages), redesigned `/docs` landing with feature-grid layout, cross-section prev/next navigation.
- **Five new doc pages**: `/docs/introduction`, `/docs/quickstart`, `/docs/faq`, `/docs/troubleshooting`, `/docs/changelog`.
- **`/blog` section** with two seed posts: "Why we built amesh" (essay) and "Introducing amesh 0.3" (release notes). Includes `BlogPosting` JSON-LD schema and proper `article:*` Open Graph meta.
- **JSON-LD structured data** on every page: `Organization` + `SoftwareApplication` + `WebSite` on the homepage, `BreadcrumbList` + `TechArticle` on every `/docs/*` and `/use-cases/*` page, `FAQPage` schema on `/docs/faq`, `Blog` + `BlogPosting` on the blog pages. Biggest single SEO improvement in the repo so far.
- **Favicon + webmanifest** (`favicon.ico`, `icon-192.png`, `icon-512.png`, `site.webmanifest`) for Google SERP icon support and PWA basics.
- **Sitemap entries** for all new routes and `/docs/key-storage` (was missing).

### Changed

- **`@authmesh/agent` oclif config** — added `topicSeparator: " "` so `amesh-agent agent start` (space-separated) resolves correctly under the JS fallback path. Previously only colon syntax (`agent:start`) worked under Node, which meant users hitting the fallback path saw topic help instead of the Bun runtime guard error.
- **`packaging/build-bun.mjs`** refactored to a shared `compile()` helper invoked once for `amesh` and once for `amesh-agent`. Both binaries land in `packaging/dist/` and are packed into the same release tarball.
- **Homebrew formula** (`packaging/homebrew/amesh.rb` + the heredoc in `release-packages.yml`) installs `amesh-agent` alongside `amesh` from a single `brew install ameshdev/tap/amesh`. Added the `on_linux/on_arm` block for the new linux-arm64 target.
- **Hero chip** on the landing page: `Production ready` → `Beta`. The 0.3.x line is a pre-1.0 product and "production ready" was overclaiming.
- **Comparison table** on the landing page: `Vault` column renamed to `Secrets Manager`. Matches the genericize-company-names policy below.
- **Genericize company mentions across prose.** Removed `AWS Secrets Manager`, `HashiCorp Vault`, `Doppler`, `Uber`, `Samsung`, `Toyota`, `Twitch`, `Ethereum`, `Signal`, `Cloudflare` from the landing page, blog, `/docs/introduction`, `/docs/faq`, and `docs/why-amesh.md`. The technical critique of the secrets-manager pattern is preserved; the name-dropping is gone. Product/infrastructure names required for instructions (Cloud Run, Homebrew, npm, Bun, TPM, Secure Enclave, etc.) are kept.
- **Flattened navigation** — removed the Use Cases dropdown. Nav is now a flat list: `Docs | Use Cases | Blog | GitHub | Get Started`.
- **Hero visual upgrades** — trust strip below hero with `@noble/*` dependency credits, card lift hovers with shadow on all feature/replace/CTA cards, tightened h1 typography.
- **ADR-011** (`docs/architecture-decisions.md`) — marked partially superseded. The "one package, one binary" design was reversed in favor of splitting the agent into `@authmesh/agent`. Runtime-dependency argument (`Bun.spawn({ terminal })` is Bun-only) outweighed the install-confusion concern once prebuilt binaries landed.

### Fixed

- **`/docs/remote-shell` showed phantom commands and install methods.** The page displayed `amesh agent start` (command doesn't exist — it's `amesh-agent agent start` from a separate package), referenced `brew install ameshdev/tap/amesh-agent` (no such formula), and linked to an `amesh-agent-linux-x64.tar.gz` download (never built). All corrected, plus a Runtime Requirement callout was added until binaries are verified in the first tagged release.
- **`TableOfContents` magic-number margin** — replaced hardcoded `margin-left: 44rem` with a responsive `left: min(calc(50vw + 30rem), calc(100vw - 13.5rem))` calc, gated on the `2xl` breakpoint where there's actually room for a right-rail TOC. Between `lg` and `2xl`, the collapsible mobile-style TOC takes over instead of overlapping content.
- **Sitemap missing `/docs/key-storage`** — added, along with all new routes.
- **`docs/remote-shell-spec.md` and `docs/why-amesh.md`** updated to match the agent package split and the genericize-company-names policy.
- **`packages/cli/README.md`** — removed the stale `amesh agent start` command listing (that command lives in `@authmesh/agent`, not `@authmesh/cli`) and added a pointer to the separate agent package.
- **`packages/agent/README.md`** — dropped the phantom Homebrew tap reference, documented the postinstall binary download, listed the four supported platforms and the armv7 exclusion.

## [0.3.3] - 2026-04-04

### Fixed

- **Device ID derivation mismatch** — `invite` and `listen` derived device IDs with raw `base64url(pubkey)` while `init` used `SHA-256(pubkey)` per the protocol spec. The relay could never match the controller's allow list entry to the agent's registration, silently breaking shell routing. All commands now use `generateDeviceId()` consistently. **Existing pairings need re-pairing.**
- **Compiled binary broken** (carried from v0.3.2) — `sea.ts` entry point restored with all 8 commands.

## [0.3.2] - 2026-04-04

### Fixed

- **Compiled binary broken** — `sea.ts` entry point was removed as a "Node.js legacy" but is required for Bun compiled binaries (oclif needs `package.json` which doesn't exist inside `/$bunfs`). Restored with all 8 commands including `grant` and `shell`.

## [0.3.1] - 2026-04-04

### Fixed

- **macOS Keychain stale key accumulation** — `SecItemDelete` only removes one Keychain item per call; multiple `amesh init --force` runs accumulated stale keys under the same tag, causing `selfSig verification failed` on remote peers during pairing and shell handshakes. Fixed by looping delete until all matching items are cleared before generating a new key.

### Changed

- **Landing page version badge** updated from v0.2 to v0.3.0.
- **Security claims softened** — "replay-proof" → "replay protection", "MITM-proof" → "MITM-resistant", "hardware-bound" → "protected by Keychain, TPM, or encrypted file".
- **Remote shell install section** redesigned with tabbed Homebrew/npm/Binary options and per-command copy buttons.
- **Footer disclaimer** added — clarifies security claims describe design goals, not guarantees, with link to threat model.

### Added

- **Key Storage doc page** (`/docs/key-storage`) — explains the 3-tier fallback: Secure Enclave → macOS Keychain → TPM 2.0 → encrypted file.
- **macOS Keychain driver tests** — sign/verify round-trip, stale key regression test, key overwrite verification.
- **Encrypted-file key overwrite tests** — verifies `generateAndStore` twice uses the new key.

## [0.3.0] - 2026-04-04

### Added

- **Auto-generated passphrase** for encrypted-file backend — `--passphrase` flag removed; a 256-bit random passphrase is generated and stored in `identity.json` automatically.
- **Detection verbosity** — `amesh init` now shows which backend tiers were checked and which was selected.
- **Identity info in `amesh list`** — new "This device" section at top showing device ID, friendly name, backend, and created date.
- **Docs sidebar** — persistent left navigation on all doc pages (desktop: always visible, mobile: collapsible dropdown).
- **ADR-010** — documents the passphrase-colocation security decision and threat analysis.

### Changed

- **`BACKEND_LABELS` and `generatePassphrase()` exported from `@authmesh/keystore`** — eliminates 4x duplication across CLI and agent packages.
- **Inline `Identity` interfaces removed** — 6 duplicated partial interfaces replaced with imports from canonical source.
- **Encrypted-file backend warning strengthened** — now explicitly says "SOFTWARE-PROTECTED only" and "not bound to hardware" in `amesh init`, `amesh list`, and auto-detection output.
- **Comparison table and feature claims corrected** — "Nothing to leak" → "One device" blast radius, "first no shared secrets" removed (mTLS predates amesh), SOC2 claims replaced with "per-device audit trail", Signal comparison replaced with "similar to Bluetooth pairing".
- **28 stale doc references updated** — removed `--passphrase` from all guides, landing page, and CLI output samples.
- **Use cases index** now includes Remote Shell; navbar "Use Cases" is a clickable link; docs hub uses cross-link instead of full grid.

### Fixed

- **Stale `--passphrase` error message** in `createForBackend()` — now directs users to `amesh init` or `AUTH_MESH_PASSPHRASE` env var.
- **Non-existent Docker image** (`ghcr.io/ameshdev/amesh-relay:latest`) removed from self-hosting guide.
- **Node.js REPL reference** in guide.md updated to Bun.

### Security

- **Passphrase stripped from memory** after KeyStore creation at all 6 call sites (`delete identity.passphrase`).
- **Atomic write** for `identity.json` in SDK bootstrap (tmp + rename pattern).
- **Bun runtime guard** added to relay start — clear error message with install instructions when run on Node.js.

## [0.1.3] - 2026-03-31

### Fixed

- **macOS Keychain not detected in Homebrew installs** — the Swift Secure Enclave helper (`amesh-se-helper`) was not bundled in release tarballs, causing silent fallback to the passphrase-based encrypted-file backend on macOS.

### Changed

- **Swift helper bundled in macOS releases** — `amesh-se-helper` is now compiled and included in darwin tarballs. Homebrew installs it alongside the `amesh` binary.
- **Helper path resolution** — `macos-keychain.ts` now searches next to the running executable first (compiled/Homebrew), then falls back to the source tree path (development).
- **Build script** (`packaging/build-bun.mjs`) compiles the Swift helper automatically on macOS targets.

## [0.1.2] - 2026-03-31

### Changed

- **CLI binary migrated from Node.js SEA to Bun compile** — binary size reduced from 123MB to 61MB (~50%), fixes segfault on macOS.
- **WebSocket client switched from `ws` to native WebSocket API** — works in both Bun and Node.js, removes a runtime dependency.
- **Release pipeline simplified** — 4-step SEA build (esbuild + blob + postject + codesign) replaced with single `bun build --compile`.

### Removed

- `ws`, `@types/ws`, `esbuild`, `postject` dependencies from CLI package.
- Node.js SEA config (`sea-config.json`) and build script (`build-sea.mjs`).

## [0.1.1] - 2026-03-30

### Security

- **AllowList HMAC** now derived from private key material (encrypted-file) or a stored random secret (hardware keystores), not the public key which was publicly known from `identity.json`.
- **Bootstrap token** embeds controller public key (`pub` field) — signature verified against trusted embedded key, not untrusted relay message.
- **ECDH shared secret** returns raw 32-byte x-coordinate per NIST SP 800-56A (was including compressed point prefix byte).
- **File permissions**: all sensitive files (keys, identity, allow list) written with `0o600`/`0o700`.
- **deviceId** validated against path traversal (`/^[a-zA-Z0-9_-]+$/`).
- **Bootstrap jti** entropy increased from 32 to 128 bits.
- **Relay hardening**: per-OTC brute-force tracking (max 5 per OTC), `maxPayload` 64KB, connection limit 10K, bootstrap watcher TTL + cleanup, message field whitelisting.
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

[0.1.3]: https://github.com/ameshdev/amesh/releases/tag/v0.1.3
[0.1.2]: https://github.com/ameshdev/amesh/releases/tag/v0.1.2
[0.1.1]: https://github.com/ameshdev/amesh/releases/tag/v0.1.1
[0.1.0]: https://github.com/ameshdev/amesh/releases/tag/v0.1.0
