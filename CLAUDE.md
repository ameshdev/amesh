# amesh

Hardware-bound M2M authentication. Replaces static API keys with P-256 ECDSA device identities stored in Secure Enclave / TPM. Zero static secrets.

**npm scope: `@authmesh`** (e.g., `@authmesh/core`, `@authmesh/sdk`, `@authmesh/cli`)

## Docs

- `docs/protocol-spec.md` — Full protocol specification (v2.0.0). Source of truth for all crypto, wire formats, and flows.
- `docs/architecture-decisions.md` — ADRs explaining every non-obvious choice (P-256 over Ed25519, no keytar, SAS, etc.)
- `docs/roadmap.md` — Build phases and progress tracking.

## Stack

| Concern | Choice | Notes |
|---------|--------|-------|
| Language | TypeScript, Node.js 20 LTS | ESM (`"type": "module"`) |
| Package manager | pnpm 10.x | Monorepo workspaces. No bun (native module issues). |
| Build | `tsc -b` (libs), Turborepo v2 | `turbo.json` at root |
| Test | vitest v4 | `passWithNoTests: true` in all configs |
| Lint | eslint 9 flat config + prettier | Config at root `eslint.config.js` |
| CLI | oclif v4 | `packages/cli/` |
| Crypto — curves | `@noble/curves` **2.0.1** | P-256 ECDSA + ECDH. Pin exact. |
| Crypto — hashes | `@noble/hashes` **2.0.1** | SHA-256, HMAC, HKDF, Argon2id. Pin exact. |
| Crypto — ciphers | `@noble/ciphers` **2.1.1** | ChaCha20-Poly1305. Pin exact. |
| Relay | Fastify **v5** + @fastify/websocket | Not v4 (EOL). |

## Noble v2 Import Paths (Critical)

```typescript
import { p256 } from '@noble/curves/nist.js';       // NOT /p256
import { sha256 } from '@noble/hashes/sha2.js';     // .js suffix required
import { hmac } from '@noble/hashes/hmac.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { bytesToHex } from '@noble/hashes/utils.js';
```

**v2 API changes:**
- `p256.sign()` returns `Uint8Array` (64-byte compact r||s) directly — no `.toCompactRawBytes()`
- `p256.utils.randomSecretKey()` — NOT `randomPrivateKey()`
- `hkdf(sha256, ikm, salt, info, len)` — salt and info MUST be `Uint8Array`, not strings

## Packages

```
packages/
  core/       — crypto primitives: sign, verify, canonical string, nonce, HMAC, HKDF, ECDH
  keystore/   — KeyStore interface + drivers: secure-enclave, tpm, os-keyring, encrypted-file
  cli/        — amesh CLI (oclif): init, listen, invite, list, revoke
  sdk/        — AuthMeshClient (fetch wrapper) + authMeshVerify middleware
  relay/      — stateless WebSocket relay for handshake pairing
```

## Commands

```bash
pnpm install        # install all deps
pnpm build          # turbo build (tsc -b per package)
pnpm test           # turbo test (vitest per package)
pnpm lint           # turbo lint (eslint per package)
```

## Rules

- **Spec is the source of truth.** `docs/protocol-spec.md` defines all crypto, wire formats, and flows.
- **Pin exact versions** for `@noble/*`. Never `^`. Supply-chain attack = catastrophic.
- **Private keys never leave KeyStore.** `sign()` takes message, returns signature. Key never returned.
- **Adversarial tests first.** Replay, clock skew, MITM, tampered allow list, body swap.
- **allow_list.json is HMAC-sealed.** Every read verifies, every write reseals. Atomic writes (tmp + rename).
- **401 bodies never leak error details** to clients. Log server-side only. Exceptions: `timestamp_out_of_range`, `unsupported_version`.
- **Signatures use raw r||s (64 bytes)**, not DER encoding.
- **SAS verification** in handshake: `truncate(SHA-256(targetPub || controllerPub || sharedSecret), 6 digits)`.

## Session Hygiene

**At session start:** Read `docs/roadmap.md` to find current phase and next task.

**At session end (when user says "save progress", "wrap up", or "done for now"):**
1. Update `docs/roadmap.md` — check off completed items, add new **technical** items only
2. Marketing, ops, and DevOps tasks go in `.claude` memory (`project_internal_tasks.md`), not the public roadmap
3. Update memory files — save anything learned that future sessions need (gotchas, decisions, user preferences)
4. If a new ADR was made, append to `docs/architecture-decisions.md`

**This file must stay under 4k tokens.** If it grows past ~500 words, move details to `docs/` and keep this file as pointers. Never inline full specs, API docs, or examples here — reference the file path instead.
