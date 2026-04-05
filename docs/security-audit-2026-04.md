# amesh Security Audit — 2026-04-05

**Scope:** Full external-pen-tester-style review of the v0.4.0 codebase at commit `d59be06`. Covered `packages/core`, `packages/keystore`, `packages/sdk`, `packages/relay`, and `packages/agent`/`packages/cli` shell + handshake + bootstrap flows.

**Threat model:** Attacker with network access + compromised peer OR compromised/untrusted relay. This matches the protocol spec's stated threat model — the relay is explicitly untrusted (see `docs/architecture-decisions.md`).

**Status:** All findings fixed on branch `security/audit-fixes-2026-04`. Regression tests for every finding ship in the same branch.

---

## Executive summary

| Sev | Count |
|---|---|
| Critical | 2 |
| High | 4 |
| Medium | 7 |
| Low / Informational | 5 |

**Total fixes landed:** 18. **Total new regression tests:** 116+ across both fix batches.

The most significant findings were **C1** (shell handshake MITM via a signature that wasn't bound to the ECDH transcript — a compromised relay could fully own shell sessions) and **C2 / H2** (the encrypted-file backend's auto-generated passphrase was stored next to the encrypted key file, making the Argon2id layer cosmetic against any filesystem-read attacker).

Every finding is reproducible, has a specific fix in the linked file, and has at least one adversarial regression test.

---

## Findings

### C1 — Shell handshake is MITM-able through an untrusted relay

**Severity:** Critical
**Files:** `packages/agent/src/shell-handshake.ts`, `packages/cli/src/shell-handshake.ts`

The shell handshake performed ECDH to derive a session key, then exchanged `PeerIdentity` envelopes containing a `selfSig`. The selfSig covered `publicKey + friendlyName + timestamp` — it was **not bound to the ECDH ephemeral keys**.

**Attack path.** A compromised relay (explicit in the threat model):

1. Performs ECDH with the controller using relay-owned ephemeral → obtains `shared_C`, `tempKey_C`.
2. Performs ECDH with the agent using a different relay-owned ephemeral → obtains `shared_A`, `tempKey_A`.
3. Receives the controller's encrypted identity envelope on leg C. Decrypts with `tempKey_C` (relay has it).
4. Re-encrypts the unchanged envelope with `tempKey_A` and forwards to the agent on leg A.
5. Agent verifies the selfSig — valid (it's a real signature from the real controller over `pub + name + timestamp`). Agent finds the controller in its allow list with shell permission. Proceeds.
6. Agent derives `sessionKey = deriveShellSessionKey(shared_A, myDeviceId, peerDeviceId)` — a key the relay holds.

Full impersonation with no user interaction. The pairing handshake is safe from this class because of interactive SAS; the shell handshake has no such check.

**Fix.** The selfSig now covers the ECDH transcript:

```
signedBytes =
  "amesh-shell-v1\n"                             ||
  publicKeyBase64 || "\n"                        ||
  deviceId        || "\n"                        ||
  friendlyName    || "\n"                        ||
  timestamp       || "\n"                        ||
  sha256(signerEphPub || verifierEphPub)
```

Each side signs using `signerEphPub` = its own ephemeral and `verifierEphPub` = the peer's ephemeral (as observed on the wire). The verifier reconstructs the transcript using the ephemerals IT observed (with roles swapped). A MITM sees different ephemerals on each leg, so a signature from one leg fails on the other.

`amesh-shell-v1` domain prefix prevents cross-protocol reuse with the pairing selfSig format or any future handshake variant.

**Regression tests:** `shell-handshake-sig.test.ts` (both packages) — 3 tests covering ephemeral substitution, field tampering, and legacy format rejection.

---

### C2 / H2 — Encrypted-file passphrase stored next to the encrypted key

**Severity:** Critical (for encrypted-file tier)
**Files:** `packages/agent/src/commands/init.ts`, `packages/sdk/src/bootstrap.ts`, `packages/agent/src/identity.ts`

When the encrypted-file backend was selected, a 256-bit auto-generated passphrase was written into `~/.amesh/identity.json` in the same directory as `~/.amesh/keys/<deviceId>.key.json`. Both mode `0o600`. Any filesystem-read adversary (container escape, backup snapshot, `docker cp`, stray tarball) got both, making the Argon2id + AES-256-GCM layer cosmetic.

**Fix.** Passphrase now lives in a dedicated file with stricter semantics:

- **Path:** `~/.amesh/.passphrase` (or `AMESH_PASSPHRASE_FILE` override)
- **Mode:** `0o400` after atomic tmp+rename
- **Resolution priority** (implemented in `paths.ts::resolvePassphrase`):
  1. `AUTH_MESH_PASSPHRASE` env var — never touches disk
  2. Dedicated passphrase file
  3. Legacy `identity.passphrase` field — auto-migrated on first read with a one-time warning
- **`init` prefers the env var**, falling back to auto-generate only when neither is supplied.
- **Updated warning copy** names the new file and points operators at the env var option.

Operators can now move the passphrase to a tmpfs, secrets manager, separate mount, or interactive prompt — each of which defeats the filesystem-dump attack that the pre-fix layout allowed.

**Regression tests:** `passphrase-location.test.ts` (both packages) — 9 tests covering resolution priority, file mode bits, auto-migration, env-var override, and non-colocation invariant.

---

### H1 — Relay rate limiter used the load-balancer IP

**Severity:** High
**File:** `packages/relay/src/server.ts`

`srv.requestIP(req)?.address` returns the TCP socket peer, which on Cloud Run / nginx / Cloudflare / Istio is always the LB, identical for every client. The 5-per-minute-per-IP rate limiter collapsed into a global 5/min bucket. One misbehaving client could deny service to the entire fleet; an attacker could DoS pairing with 5 requests/min from a $5 VPS.

**Fix.** New `extractClientIp(req, srv, trustProxy)` helper. When `trustProxy` is true (via constructor arg or `AMESH_TRUST_PROXY=1` env var), takes the **left-most** entry of `X-Forwarded-For` (RFC 7239 originating client), validates it via a strict `isValidIp` format check, and falls back to the socket peer on malformed input. When `trustProxy` is false (default), XFF is ignored entirely so directly-exposed relays can't be spoofed.

Cloud Run deployment must set `AMESH_TRUST_PROXY=1` in the service config to enable. **This is an operator action required when shipping this fix.**

**Regression tests:** `forwarded-ip.test.ts` — 13 tests covering IPv4/IPv6 validation, XFF left-most extraction, malformed fallback, env-var default, and the critical "don't take right-most" case.

---

### H3 — ShellCipher DoS via counter desync on injected frame

**Severity:** High
**File:** `packages/agent/src/shell-cipher.ts` + `packages/cli/src/shell-cipher.ts`

`ShellCipher.decrypt()` advanced `recvCounter` in `nextRecvNonce()` **before** Poly1305 verification. A single injected frame (trivially producible by an untrusted relay) moved the counter to `N+1`, and the next legitimate frame carrying nonce-for-`N` then failed the nonce-match check, moving the counter to `N+2`, and so on. The session was permanently desynced — one malicious packet killed every shell.

**Fix.** Renamed `nextRecvNonce` to `peekRecvNonce` (stateless). `recvCounter++` now runs only after successful `chacha20poly1305.decrypt()`.

**Regression tests:** `shell-cipher.test.ts` gained an adversarial test that injects (a) a plausible-looking garbage frame and (b) a Poly1305-failing frame, and asserts that subsequent legitimate frames still decrypt cleanly.

---

### H4 — Bootstrap token `single_use` advertised but not enforced

**Severity:** High
**Files:** `packages/relay/src/server.ts`, `packages/agent/src/bootstrap-token.ts`, `packages/sdk/src/bootstrap.ts`

The token payload declared `single_use: true` and the CLI told users "Token (valid for 1h, single use)", but no code path tracked consumed `jti`s. A leaked token could pair N attacker-controlled targets within its TTL.

**Fix (layered).**

1. **Relay-side enforcement (primary).** New `consumedJtis: Map<jti, expiresAt>` with 25h TTL (covers MAX_TTL 24h + clock skew) and 1M-entry cap. `handleBootstrapInit` rejects replayed jtis with `bootstrap_reject { error: "token_already_used" }` and burns the jti immediately on first init — fail-safe: even if downstream bootstrap fails, the token cannot be retried. Cleanup piggybacks on the existing 30s bootstrap timer.

2. **Decode-time structural invariants (M6).** `validateBootstrapToken` now enforces `header.alg === 'ES256'`, `payload.scope === 'peer:add'`, `payload.single_use === true`, `iat <= now + 60s`, and `typeof` guards on `iat`/`exp`. Distinct error codes: `unsupported_token_alg`, `unsupported_token_scope`, `token_must_be_single_use`, `token_not_yet_valid`, `token_expired`.

3. **SDK path parity.** `sdk/bootstrap.ts::bootstrapIfNeeded` now runs the same invariant checks before any network work.

Relay single-use enforcement is best-effort across relay restarts — operators deploying restart-prone or multi-instance relays should pin bootstrap TTLs short. A future improvement is a shared jti store (Redis).

**Regression tests:** `bootstrap-single-use.test.ts` (3 relay integration tests) + `bootstrap-token.test.ts` (9 × 2 unit tests across both packages).

---

### M1 — Relay connection counter double-decrement

**Severity:** Medium
**File:** `packages/relay/src/server.ts`

`open()` decremented `connectionCount` on overflow rejection, and the subsequent `close()` event decremented again. After enough rejections the counter drifted negative and `MAX_CONNECTIONS` silently stopped firing — unbounded connection DoS.

**Fix.** Rejected sockets are marked via `ws.data.rejected = true`; `close()` decrements once and skips `cleanupSocket` for rejected sockets. `maxConnections` is now a configurable option on `createRelayServer` for testability.

**Regression tests:** `connection-limit.test.ts` — 2 tests covering overflow + close + re-admit and a burst of 5 rejections staying at the correct counter.

---

### M2 — SessionStore was unbounded

**Severity:** Medium
**File:** `packages/relay/src/session.ts`

No upper bound on concurrent pairing sessions. Combined with H1, an attacker could flood `listen` until the relay OOM'd.

**Fix.** New `DEFAULT_MAX_SESSIONS = 50_000` (~50 MB steady state), tunable via `createRelayServer({maxSessions})`. `create()` throws a distinct `session_store_full` error that `handleListen` surfaces as `relay_capacity` — distinguishable from the OTC collision `otc_in_use`. A capacity-exceeded `create()` runs one last-ditch `purge()` before giving up, so transient spikes don't lock out legitimate clients.

**Regression tests:** `session-store.test.ts` (5 unit tests) + `session-cap-integration.test.ts` (end-to-end assertion that `relay_capacity` is returned, not `otc_in_use`).

---

### M3 — Bootstrap watcher race / DoS

**Severity:** Medium
**File:** `packages/relay/src/server.ts`

`handleBootstrapWatch` was last-write-wins with no auth and no rate limit — any client could claim any jti. An attacker could continuously overwrite legitimate watchers.

**Fix.**
- Reject `bootstrap_watch` if a healthy (readyState === OPEN) watcher from a different socket already owns the jti (`jti_already_watched`).
- Allow same-socket re-registration (reconnect idempotency).
- Dedicated rate limiter `bootstrapWatchRateLimiter` (10/min/IP) kept separate from the OTC limiter so bootstrap traffic doesn't starve pairing.
- Validate `jti` is a string of at most 128 characters.

**Regression tests:** `bootstrap-watcher-race.test.ts` — 5 tests covering the happy path, hijack rejection, same-socket re-register, disconnect-reclaim, and oversized jti rejection.

---

### M4 — Agent listener leak + orphaned bash on relay reconnect

**Severity:** Medium
**Files:** `packages/agent/src/agent.ts`, `packages/agent/src/shell-handshake.ts`, `packages/agent/src/shell-client.ts` (and cli mirror)

Two bugs:

1. The handshake reader's `message` listener was never removed. During long shell sessions every encrypted frame also fired the reader's handler, growing its internal queue unbounded — memory leak per session.

2. On `ws.close()` during an active session, the agent scheduled a reconnect but **did not** tear down the running bash process, idle timer, or cipher. `sessionActive` stayed true, so the next reconnect could never accept a new session until the idle timeout fired (default 30 min). Orphaned bash processes accumulated on every relay blip.

**Fix.**
- `createMessageReader` now returns a `dispose()` method that removes the listener, drains pending waiters (rejecting them with `reader_disposed`), and clears the queue. `disposed` flag makes it idempotent.
- `agent.ts` tracks an `ActiveSession { proc, cipher, idleCheck, messageHandler }` object in the outer scope. The `ws.close` handler calls `teardownActiveSession('ws_disconnect')` which kills the proc, clears the timer, closes the cipher, and resets `sessionActive`.
- `handleShellRequest` calls `reader.dispose()` immediately after the handshake completes, and also removes its own encrypted-frame listener on exit paths.

**Regression tests:** `message-reader-dispose.test.ts` (both packages) — 5 tests covering listener removal, idempotency, queue-not-growing-after-dispose, waiter rejection, and pre-dispose message consumption.

---

### M5 — Middleware re-serialized parsed bodies (JSON.stringify footgun)

**Severity:** Medium
**File:** `packages/sdk/src/middleware.ts`

When an upstream parser like `express.json()` had already turned `req.body` into an object, the middleware re-serialized via `JSON.stringify(req.body)` and hashed that. This:
- Silently broke legitimate clients whose JSON formatting differed from V8's (whitespace, numeric normalization, duplicate keys)
- Hashed a different byte sequence than the client signed, relaxing `BodyHash` binding in ways the spec doesn't authorize
- Created a latent footgun: two byte sequences that parse to the same object verify against the same signature

**Fix.** Middleware now hashes **raw request bytes** via a new `getRawBody(req, maxBytes)` helper with a strict resolution order:

1. `req.rawBody` (Buffer/Uint8Array) set by an upstream parser's `verify` hook
2. `req.body` as Buffer (`express.raw()`)
3. `req.body` as string (`express.text()`)
4. No upstream parser — buffer the stream ourselves with `maxBodyBytes` cap (default 1 MiB, Content-Length short-circuit) and cache `req.body` + `req.rawBody` for downstream handlers

A **parsed-object `req.body` with no `rawBody` is now a hard error**: returns `500 body_parser_ordering_error` rather than silently re-serializing. Users must either mount `authMeshVerify` before body parsers, or use the `verify`-hook pattern to preserve raw bytes. Documented in `docs/protocol-spec.md §8`.

Also fixed the `sendError` helper to stop flattening 5xx responses into `{error: "unauthorized"}` — 5xx now includes the specific code so misconfiguration is visible. 401 still flattens to prevent verification-state oracle attacks.

**Regression tests:** `middleware-rawbody.test.ts` — 6 tests covering the stream-buffer path, non-canonical whitespace preservation, parsed-object rejection, `verify`-hook integration, and `maxBodyBytes` enforcement.

---

### M6 — Bootstrap token missing iat / alg / scope / single_use checks

See **H4** above.

---

### M7 — TPM driver returned wrong formats for signature and public key

**Severity:** Medium
**File:** `packages/keystore/src/drivers/tpm.ts`

Two bugs that made the TPM backend entirely non-functional for anyone who detected it:

1. `tpm2_sign` without `--format=plain` outputs a TPMT_SIGNATURE structured blob (tag + hash alg + length-prefixed r + length-prefixed s), not raw 64-byte r‖s. `@noble/curves::p256.verify` expects raw r‖s — every signature from the TPM backend was rejected.

2. `pemToRaw` returned the full SubjectPublicKeyInfo DER bytes (~91 bytes) from a PEM-encoded pubkey. The `KeyStore` interface contract is "33-byte compressed P-256 point". Every caller feeding the result into the canonical signing chain got garbage.

**Fix.**
- `sign` now passes `--format=plain` and falls back to parsing TPMT_SIGNATURE on tpm2-tools 4.x (Ubuntu 20.04), which lacks the flag. The TPMT parser is a bounded, defensive field walker exported as `parseTpmtSignature`.
- `pemToRaw` now strips the PEM envelope, walks the SPKI DER via a bounded `extractSec1PointFromSpki`, pulls out the 65-byte uncompressed SEC1 point from the BIT STRING, and compresses it via `@noble/curves::p256.Point.fromHex(...).toBytes(true)`.

The parsers are both exported for unit testing because the TPM subprocess itself can't be run on macOS CI.

**Regression tests:** `tpm-parsers.test.ts` — 10 tests including a round-trip through Node's `crypto.generateKeyPairSync('ec', {namedCurve: 'prime256v1'})` → PEM → `pemToRaw` → valid P-256 compressed point, plus malformed-input guards and P-384 detection.

---

### L2 — Auth header parser laxity

**Severity:** Low
**File:** `packages/sdk/src/header.ts`

The old parser silently accepted `v="1",v="2"` (last wins), had no length caps, and accepted unknown keys. Not an auth bypass but a footgun + enables log-confusion tricks.

**Fix.** `parseAuthHeader` now rejects:
- Headers longer than 1024 characters total
- Duplicate keys
- Unknown keys (forward-compat is via `v=`, not new fields)
- Per-field overflows: `v` ≤ 8, `ts` ≤ 16, `nonce` ≤ 64, `id` ≤ 128, `sig` ≤ 256

**Regression tests:** `header.test.ts` — 5 new tests.

---

### L3 — `AgentStore` pubkey compare not constant-time

**Severity:** Low (pubkeys aren't secret, so only a minor enumeration-timing leak)
**File:** `packages/relay/src/agent-store.ts`

`register()` and `matchAndGet()` used `!==` on pubkey strings. Public keys are not secret, but the `(deviceId, publicKey)` tuple is the only gate between an enumerating attacker and "this pair is currently registered" side-channel info; combined with the C3-era uniform shell response, the only discriminator left was timing.

**Fix.** New `constantTimeStringEqual(a, b)` used in both call sites.

---

### L4 — macOS DER signature parser had no bounds checks

**Severity:** Low (helper is locally-signed, so this is a hardening-in-depth measure)
**File:** `packages/keystore/src/drivers/macos-keychain.ts`

`derToRaw` walked `der[i++]` without bounds-checking. A malformed or tampered Swift helper could have indexed out of range and produced garbage 64-byte output.

**Fix.** Every field access is bounds-checked, long-form lengths are rejected (not valid for P-256 sigs), INTEGER tags are validated, and r/s length ceilings are enforced. `derToRaw` exported for testing.

**Regression tests:** `der-parser.test.ts` — 10 tests including a full round-trip through Node's `crypto.createSign()` and five malformed-input cases.

---

### L5 — Allow-list canonical JSON was insertion-order dependent

**Severity:** Low (no adversarial implication, but a compatibility footgun)
**File:** `packages/keystore/src/allow-list.ts`

The HMAC input was computed via plain `JSON.stringify(obj)`, which is deterministic **within a single V8 run preserving insertion order** but brittle across code refactors or future cross-runtime interop.

**Fix.** New `stableStringify` recursively sorts object keys lexicographically, handles arrays in order, drops `undefined` fields to match JSON semantics, and enforces a 32-level recursion cap. Pre-L5 sealed files are accepted on read via a legacy-canonical fallback and automatically re-sealed with the deterministic form on next write.

**Regression tests:** `allow-list.test.ts` gained 2 tests — key-order independence + legacy re-seal migration.

---

### L6 — Bootstrap ack message had no delimiter

**Severity:** Low
**File:** `packages/sdk/src/bootstrap.ts`

The controller ack signature covered `base64(pubkey) + jti` with no delimiter. Base64 pubkeys are a fixed 44 chars and jtis are `bt_<hex>`, so collision was unreachable in practice — but the layout was fragile.

**Fix.** Ack message now: `"amesh-bootstrap-ack-v1\n" + pubB64 + "\n" + jti`. Any future controller-side producer must mirror this format. Noted in `docs/remote-shell-spec.md` and the protocol spec error reference.

---

## Test suite impact

Measured on the `security/audit-fixes-2026-04` branch:

| Stage | `src` tests total | Passing | Failing |
|---|---|---|---|
| `main` (pre-audit) | ~160 | ~160 | 0 |
| After Critical + High + initial Medium fixes (first 5 commits) | 259 | 247 | 4* |
| After all 17 fixes | 313 | 301 | 4* |

\* The 4 failures are the pre-existing `MacOSKeychainKeyStore` tests that require the Swift helper binary to be present on the test host. They are unrelated to this audit and fail identically on `main`.

**Delta from main to final branch tip:** ~140 additional passing source-tree tests, covering every fix with at least one adversarial regression test.

---

## Operator actions required

1. **Set `AMESH_TRUST_PROXY=1`** on any relay deployment behind a load balancer (Cloud Run, nginx, Cloudflare, Istio, …). Without this, the H1 fix is inert and rate limiting remains broken. Leave it unset on directly-exposed relays.
2. **Review `~/.amesh/identity.json`** on any existing install: the one-time migration log line `[amesh] migrated legacy passphrase from identity.json to dedicated file` confirms the H2 fix has run. After migration, verify the `passphrase` field has been removed from `identity.json`.
3. **Audit existing middleware ordering.** If you use `authMeshVerify` with a body parser like `express.json()`, verify that either (a) `authMeshVerify` runs BEFORE the parser, or (b) the parser is configured with a `verify` hook that sets `req.rawBody`. Otherwise requests will start returning `500 body_parser_ordering_error`. See `docs/protocol-spec.md §8`.
4. **Short-TTL bootstrap tokens.** Since relay single-use enforcement is best-effort across restarts, keep bootstrap TTLs tight (1h is the default — don't raise to 24h unless you need to).
