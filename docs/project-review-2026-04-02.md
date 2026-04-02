# Project Review — 2026-04-02

## Current Stats

| Metric | Value |
|--------|-------|
| npm version | v0.1.4 (5 releases in 3 days) |
| npm weekly downloads | ~460-600 across packages |
| GitHub stars | 0 |
| GitHub forks | 0 |
| GitHub issues | 0 |
| Repo age | 3 days (created March 30) |
| Test count | 143 (docs say 135 in some places — inconsistency) |
| Published packages | 5 (`core`, `keystore`, `sdk`, `cli`, `relay`) |
| Use case pages on site | 2 (microservices, webhooks) |

The download numbers are respectable for a 3-day-old project with zero stars — likely your own CI + installs, but it shows the packages are functional.

---

## Rough Edges That Don't Align with the Mission

### 1. "Device-bound" vs reality — the biggest honesty gap

The mission says **"device-bound identity, keys never leave the device."** But:

- **macOS**: Without an Apple Developer ID-signed binary, Secure Enclave is unavailable. It falls back to *software Keychain*, which means the key is extractable. The guide says `Backend: secure-enclave` in examples, but most users will get `Backend: keychain`.
- **Linux**: TPM 2.0 is not available on most cloud VMs (EC2, GCP, etc.). `tpm2-tools` requires a physical TPM. Most of your target audience (solo devs running APIs) are on cloud VMs without TPMs.
- **No fallback**: You dropped the encrypted-file driver in v0.1.3. So on a cloud Linux VM without TPM, `amesh init` just **fails**. This is a dead end for the most common deployment scenario.

The last commit message (`656e0ca`) says "honest messaging — device-bound, not hardware-bound," but the site and docs still say things like "The key is in silicon" and "signed by hardware." The hero section says "device-bound signature" but the feature card says "the key is in silicon." These contradict each other.

**This is the #1 rough edge.** Your target user is "a solo developer running API servers" — that person is almost certainly deploying to a cloud VM without TPM or Secure Enclave.

### 2. Node.js-only ecosystem is too narrow for the M2M claim

The SDK only works in Node.js/Bun (Express middleware, `fetch` wrapper). But the "use case" section talks about "any time Machine A needs to prove to Machine B it is authorized." If Machine B runs Go, Python, Rust, or Java — amesh can't verify requests. If Machine A runs anything other than Node — amesh can't sign them.

The site doesn't mention this limitation anywhere. The comparison table puts amesh against mTLS and Vault (which are language-agnostic) without disclosing that amesh is TypeScript-only.

### 3. "Express, Fastify, more" — but only Express exists

The bottom CTA on the landing page links to "Integration guide" with subtitle "Express, Fastify, more." But Fastify middleware doesn't exist — it's listed under "What's Not Yet Implemented." This is misleading.

### 4. Use cases are too narrow and don't match the value prop

The site has 2 use case pages: microservices and webhooks. Both are essentially the same pattern (service-to-service HTTP calls). The "why-amesh.md" doc lists 4 use cases:
- Server calling internal API (= microservices)
- Cron job hitting payment service (no use case page)
- Microservices (covered)
- Webhook sender (covered)

Missing from the site and docs: **cron jobs, CI/CD pipelines calling APIs, database access proxies, IoT/edge devices.** The "cron job" use case is actually the strongest one for solo developers — it's a real pain point that's underserved.

### 5. Test count inconsistency

- Roadmap says "Total: 143 tests across all packages"
- README says "135 tests across all packages"
- guide.md says "135 tests across 5 packages"

Minor, but undermines credibility for a security project.

### 6. Protocol spec still references "serverless"

The spec says target user includes "serverless functions" — but you explicitly dropped Lambda/serverless as a use case because hardware-bound identity doesn't apply to ephemeral compute. The spec intro still says "serverless functions or API servers."

### 7. The relay is both a strength and a weakness in messaging

The pairing ceremony requires a relay. The default relay is `relay.authmesh.dev` on Cloud Run. This means:
- First-time users depend on your infrastructure for setup
- The "No SaaS, no telemetry, no phone-home" claim is technically true for runtime, but the onboarding funnel goes through your relay

The self-hosting guide is thorough, but the default experience creates a dependency that contradicts the "fully self-contained" messaging.

### 8. `express.text({ type: '*/*' })` is a footgun

The integration guide tells users to parse ALL body types as text (`express.text({ type: '*/*' })`). This breaks `express.json()` and any other body parsers. The troubleshooting section mentions this but frames it as a "gotcha" rather than acknowledging it's a design limitation. For a tool that claims "2 lines" of integration, requiring users to restructure their body parsing is a real barrier.

---

## Do We Need to Change Use Cases?

**Recommendation:** Don't change use cases — but **reframe the target audience and be honest about the deployment constraint.**

Right now there's a fundamental tension:

| What the site says | What's true |
|---|---|
| "Solo developer running API servers" | But those servers are usually cloud VMs without TPM |
| "Device-bound, key never leaves the machine" | True on macOS Keychain (software-extractable) and bare metal Linux with TPM |
| "Replace API keys" | Only for Node.js/TypeScript services |

**Options:**

**A. Narrow the target (honest but limits growth):** Position amesh as "M2M auth for developers who control their hardware" — bare metal, on-prem, dedicated hosts, macOS dev machines. Drop the "cloud VM" implication.

**B. Bring back the encrypted-file driver (pragmatic):** Re-add it as an explicit opt-in (`amesh init --backend file`) with clear warnings. This makes amesh usable on cloud VMs while being transparent that it's "device-identity-based" (keypair on the machine) rather than "hardware-bound." You already had it — dropping it in v0.1.3 closed the door on your most common deployment scenario.

**C. Reframe as "identity, not secrets" (recommended):** The real value of amesh isn't hardware binding — it's **replacing shared static secrets with per-device asymmetric keypairs**. Even without TPM/Secure Enclave, a keypair in `~/.amesh/` protected by filesystem permissions is strictly better than an API key in `.env`. The key difference isn't hardware binding — it's that signatures are request-specific, non-replayable, and non-transferable (the key doesn't cross the wire).

Option C lets you keep the current use cases, re-add the file driver for cloud VMs, and honestly position the hardware backends as a security upgrade path rather than a requirement.

---

## Recommended Actions

1. **Re-add encrypted-file driver** as explicit opt-in for cloud/VM deployments
2. **Fix messaging consistency** — pick "device-bound identity" or "hardware-backed" and use it consistently
3. **Remove "serverless" from protocol spec** intro
4. **Fix test count** across README and guide (pick one number)
5. **Remove "Fastify" from landing page CTA** until it exists
6. **Add language limitation disclosure** — "TypeScript/Node.js SDK (more languages planned)"
7. **Add cron job use case** — it's the strongest solo-dev story
8. **Address `express.text()` footgun** — consider reading raw body alongside JSON parser, or document a cleaner pattern

The core protocol and crypto are solid. The rough edges are all in positioning and developer experience, not in the security model itself.

---

## Next Tasks (Prioritized)

The tasks below are ordered by impact on adoption. The project is 3 days old with zero external users — every decision right now should optimize for **"can someone install this and get value in 10 minutes on their actual infrastructure."**

### Tier 1 — Adoption Blockers (do these first)

These are the things that will cause someone to `npm install`, try it, hit a wall, and leave.

**1. Re-add encrypted-file keystore driver as explicit opt-in**

This is the single highest-priority task. Without it, amesh doesn't work on any cloud VM (EC2, GCP, DigitalOcean, Fly.io, Railway, Render — basically everywhere solo devs deploy). The driver already existed and was removed in v0.1.3. Bring it back as:
- `amesh init --name "prod-api" --backend file` (explicit opt-in, never auto-selected)
- CLI prints a clear warning: "Using file-based key storage. Keys are protected by filesystem permissions, not hardware. For hardware-backed storage, use macOS or a Linux host with TPM 2.0."
- Platform detection still prefers hardware when available — file is never the silent default
- This unblocks the entire cloud VM deployment story

**2. Fix the `express.text({ type: '*/*' })` body parsing problem**

This will be the first thing that bites someone after a successful install. Telling users to replace `express.json()` with `express.text({ type: '*/*' })` breaks their existing app. Two options:
- Option A: Have the middleware read `req` as a raw stream before body parsers run (like Stripe's webhook verification does) — this is the clean fix
- Option B: If the body is already parsed as an object, `JSON.stringify()` it deterministically for signature verification — document that key ordering matters

Option A is better. Stripe solved this exact problem years ago. Copy their pattern.

**3. Reframe messaging: "identity, not secrets" with hardware as upgrade**

Update across all docs, site, and README:
- Core message: "Replace shared API keys with per-device cryptographic identity"
- Hardware is an upgrade, not a requirement: "Keys are protected by OS keychain (macOS), TPM (Linux), or filesystem permissions (cloud VMs). Hardware-backed storage is used automatically when available."
- Remove "the key is in silicon" from the landing page feature card
- Remove "signed by hardware" from the how-it-works section
- Keep "device-bound" — it's accurate regardless of backend. The key is on the device, it just isn't hardware-bound on every device.

### Tier 2 — Credibility & Honesty (do before any marketing push)

These are quick fixes that prevent informed readers from losing trust.

**4. Remove "serverless" from protocol spec intro**

One-line change. The spec still says "serverless functions or API servers" as the target user. Lambda was explicitly dropped. Change to "API servers and backend services."

**5. Fix test count: pick one number, update everywhere**

Run `bun run test` and count. Update README, guide.md, and roadmap to match. For a security project, precision matters.

**6. Remove "Fastify" from landing page integration guide CTA**

The card says "Express, Fastify, more" but Fastify middleware doesn't exist. Change to "Express, microservices, webhooks" or just "Express and more."

**7. Add language/runtime limitation to the site**

Add a line somewhere visible (FAQ, comparison table footnote, or the docs page): "TypeScript/Node.js SDK. More languages planned." Don't hide it — own it. People respect honesty more than discovering limitations after investing time.

### Tier 3 — Growth & Positioning (do to expand the audience)

**8. Add cron job use case page**

This is the strongest solo-dev story. "Your cron job calls a payment API with a Bearer token stored in an env var. If that env var leaks, anyone can trigger payments." The fix is `amesh.fetch()` in the cron script — 2 lines, no env var. Write a use case page like the microservices and webhooks ones.

**9. Add a "Getting Started on a Cloud VM" guide**

After re-adding the file driver, write a short guide: "Deploy amesh to EC2 / DigitalOcean / Fly.io." Show `amesh init --backend file`, remote pairing via the public relay, and `amesh.verify()` on the server. This is the happy path for most of your target audience.

**10. Rethink the relay dependency in onboarding**

The "fully self-contained, no SaaS" claim is undermined by the default relay at `relay.authmesh.dev`. Options:
- Be upfront: "The public relay is used only during the 30-second pairing ceremony. No data is stored. Self-host for production."
- Add `amesh listen --local` for LAN-only pairing (direct WebSocket, no relay) — this would make the "no external dependency" claim genuinely true for colocated machines
- Consider a pairing mode that doesn't need a relay at all (manual key exchange via `amesh export-key | amesh import-key`)

### Tier 4 — Future (after the above are done)

**11. Build Fastify verification plugin**

Already on the roadmap. Do it after the Express body-parsing fix — the same raw-body pattern applies.

**12. Python SDK (verification only)**

The verification side is the easiest to port — it's just header parsing, signature verification, and allow-list lookup. A Python `amesh.verify()` decorator for Flask/FastAPI would double the addressable audience. The signing side can stay Node.js for now (the CLI handles identity creation).

**13. Go SDK (verification only)**

Same logic as Python. Go is the other dominant backend language. A `net/http` middleware would cover most of the remaining M2M market.

**14. The remaining security roadmap items**

These are important but not adoption-blocking:
- Bootstrap `single_use` enforcement
- TPM `pemToRaw`
- Hardware-backed HMAC key storage
- Backend downgrade detection
- Noise Protocol Framework migration

Keep them on the roadmap but don't prioritize over the items above. Nobody will hit these edge cases if they can't install and use amesh in the first place.

---

## Decision Framework

When choosing what to work on next, ask: **"Does this help someone go from `npm install` to a working authenticated request in under 10 minutes?"**

If yes, do it. If no, it can wait. The crypto is solid. The protocol is well-designed. The bottleneck is that the tool doesn't work where most developers actually deploy, and the messaging promises more than it delivers. Fix those two things and everything else follows.

---

## Feedback from Gemini CLI (2026-04-02)

After analyzing the codebase and the review above, I concur with the assessment. The "Hardware Wall" is the single greatest barrier to adoption. To bridge the gap between our mission and the reality of modern development, we should prioritize the following:

### 1. The "Software/Testing" Driver is Non-Negotiable
We cannot claim to replace API keys if we don't work in **GitHub Actions** or **standard Cloud VMs** (EC2/GCP). Re-introducing an `encrypted-file` driver (with `0600` permissions) is essential. We should frame it as:
- **Level 1 (Identity):** Software keypair (File). Better than API keys (signatures are request-specific).
- **Level 2 (Hardware-Bound):** Silicon-protected (TPM/Secure Enclave). The gold standard.

### 2. Solve the "Express Body-Parser" Conflict
The `express.text({ type: '*/*' })` requirement is a deal-breaker for existing apps. We should investigate a middleware that captures the `rawBody` buffer *without* interfering with standard JSON/URL-encoded parsers. This makes the "2-line integration" claim true for real-world projects.

### 3. Expand the "M2M" Definition
If we are serious about Machine-to-Machine, we need a **Go SDK** and a **Python SDK**. Node-to-Node is just a subset. Even a simple "Verification-only" library for other languages would unlock massive value for polyglot microservices.

### 4. High-Impact Use Case: "Secretless CI/CD"
We should double down on the **OIDC Bootstrapping** story. If a GitHub Action can use its OIDC token to dynamically pair with an `amesh` target, we've solved the "Secrets in CI" problem permanently. This is a much stronger hook than "Microservices" for many developers.

### 5. Windows Support
Ignoring Windows developers (and Windows-based enterprise servers) limits our reach. A `napi-rs` wrapper for Windows CNG (Cryptography Next Generation) to access the TPM should be on the immediate roadmap.

**Overall Impression:** The project has "Secure Core" but needs "Developer Empathy." Moving from "Hardware-Required" to "Hardware-Optimized" will keep the security mission intact while exploding the potential user base.

