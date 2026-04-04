# Use Cases Analysis

What we have, what we're missing, and where amesh actually fits.

---

## Current State

The site has **2 use case pages**: microservices and webhooks. Both are essentially the same pattern — one Node.js service calling another over HTTP. The `why-amesh.md` lists 4 examples, but they all reduce to "Service A calls Service B with an API key."

This is too narrow. It doesn't reflect the real breadth of where developers deal with static secrets in M2M scenarios, and it makes amesh look like a niche tool for a problem most people don't think they have.

---

## The Use Cases We're Missing

### 1. Cron Jobs & Scheduled Tasks

**Why this is the strongest solo-dev story.**

Every developer has a cron job or scheduled task that calls an API. A billing reconciliation script. A nightly data sync. A health check that posts to Slack. The API key lives in a `.env` file, a crontab, or an environment variable on the server.

The pain:
- The key is sitting in plaintext on the server, often in a crontab or systemd unit file
- If the server is compromised, the attacker gets the key and can call the API from anywhere
- There's no way to distinguish "the cron job called the API" from "someone copied the key and called the API from their laptop"
- Rotating the key means updating every cron job on every server that uses it

**Why amesh fits perfectly:**
- The cron script uses `amesh.fetch()` instead of `fetch()` with a Bearer token
- No key to store — the signing happens from the device identity
- If the server is compromised, `amesh revoke` kills access for that one device instantly
- The API knows exactly which server ran the cron job (`req.authMesh.deviceId`)

**This is the "aha moment" use case.** Every developer has lived this pain. It's concrete, relatable, and the fix is 2 lines of code.

---

### 2. Internal Tools & Admin Scripts

**The pattern:** A developer runs scripts from their laptop to manage production — deploy a service, purge a cache, trigger a data migration, pull reports. Currently, these scripts use API keys or tokens hardcoded in `.env` files or passed as CLI args.

The pain:
- API keys get copy-pasted into Slack ("just use this one for now")
- Multiple developers share the same admin key — no audit trail of who did what
- The key works from any machine, so if a developer's laptop is compromised, the attacker has admin access
- When a developer leaves the team, you have to rotate the shared key (and nobody does)

**Why amesh fits:**
- Each developer's laptop IS their identity. No key to share.
- `amesh.fetch()` signs the request with the laptop's device key
- The server knows exactly which developer made the call
- When someone leaves, `amesh revoke <their-device-id>` — instant, surgical, zero coordination
- The other developers' access is completely unaffected

This is the most natural on-ramp for amesh. Developers already have laptops with Keychain/Secure Enclave. There's nothing to set up on the device side.

---

### 3. Partner & Vendor API Access

**The pattern:** You give an external partner access to your API. Currently, you generate an API key and send it to them via email, Slack, or a shared document. Both sides hope it doesn't leak.

The pain:
- The key is transmitted as a string through an insecure channel
- You have no control over where the partner stores it
- If the partner's system is compromised, your key is too
- Revoking access means generating a new key and coordinating the cutover
- You can't tell which of the partner's servers used the key

**Why amesh fits:**
- Pair devices once with `amesh listen` / `amesh invite` — the key exchange is encrypted and verified
- No shared secret is ever transmitted as a string
- Each partner server has its own device identity
- If one partner server is compromised, revoke just that device
- Full audit trail of which partner device called which endpoint and when

This is a strong use case for B2B integrations. The pairing ceremony maps directly to the "onboarding a new partner" workflow.

---

### 4. Edge Devices & IoT

**The pattern:** Physical devices (Raspberry Pi, edge gateways, kiosks, point-of-sale terminals) call a central API to report telemetry, sync data, or receive commands. Currently, each device has an API key baked into its config at deployment time.

The pain:
- API keys are baked into firmware or config files at manufacturing/deployment time
- If one device is physically compromised, its key grants access to the API
- Rotating keys across thousands of deployed devices is operationally impossible
- There's no way to attribute API calls to a specific physical device
- A stolen key can be used from any network, any machine

**Why amesh fits:**
- Each device gets its own P-256 keypair, ideally in TPM
- The private key is hardware-bound and can't be extracted from the device
- If a device is stolen or compromised, revoke it by device ID — all other devices continue working
- The API knows exactly which physical device is calling
- No key to bake into firmware — the identity IS the device

This is where the hardware-backed story is the strongest and most honest. Physical devices actually have TPMs. Edge computing is a growing market where device identity is a real, unsolved problem.

---

### 5. Background Workers & Queue Processors

**The pattern:** Worker processes pull jobs from a queue and call authenticated APIs to process them. Currently, all workers share a single API key through an environment variable.

The pain:
- N workers share one key — you can't tell which worker called the API
- A compromised worker exposes the shared key to all APIs it can reach
- Scaling up/down means provisioning and de-provisioning access
- No per-worker rate limiting or access control

**Why amesh fits:**
- Each worker instance gets its own device identity
- Per-worker audit trail and rate limiting
- Scale up: `amesh init` on the new worker, pair it
- Scale down: `amesh revoke` on the removed worker
- The other workers are unaffected

---

## Use Cases That DON'T Fit (and we should be honest about)

### CI/CD Pipelines

CI runners are ephemeral. A GitHub Actions runner spins up, runs a job, and dies. There's no persistent device identity. You could use the encrypted-file backend with a passphrase stored as a CI secret, but then you're still managing a secret — you've just moved it. The value prop is diminished.

**Verdict:** Don't actively promote this. If someone asks, explain the limitation honestly.

### Serverless Functions (Lambda, Cloud Functions)

Same problem as CI/CD — ephemeral compute with no persistent identity. We already dropped this use case. Keep it dropped.

### Browser-based Authentication

amesh is M2M. Browsers don't have TPMs accessible via JavaScript (WebAuthn/passkeys exist but that's a different protocol). Don't even hint at browser support.

### Mobile Apps

Similar to browsers — possible in theory (iOS Secure Enclave, Android Keystore), but the SDK is Node.js only and the pairing ceremony assumes CLI access. This is a future market, not a current one.

---

## Recommended Priorities

Based on adoption impact and effort:

| Priority | Use Case | Why | Effort |
|----------|----------|-----|--------|
| 1 | Cron jobs | Strongest solo-dev story, most relatable pain | Low — one page + code example |
| 2 | Internal tools | Natural on-ramp (devs already have laptops with Keychain) | Low — one page + code example |
| 3 | Partner API access | Strong B2B story, differentiates from API keys | Medium — needs a pairing walkthrough |
| 4 | Edge/IoT | Strongest hardware story, growing market | Medium — needs deployment guide |
| 5 | Background workers | Valid but less differentiating | Low — one page |

Cron jobs and internal tools should be the next two use case pages on the site. They require almost no new documentation — just a page with the pain point, a code example, and a before/after comparison. Same template as microservices and webhooks.

---

## Feedback from Gemini CLI (2026-04-02)

This is a sharp analysis that moves `amesh` from a "security primitive" to a "problem solver." I especially agree with the **Cron Jobs** and **Internal Tools** prioritization—these are the "low-hanging fruit" of secret leaks.

A few additional dimensions to consider:

### 1. The "Shadow Admin" Audit Log
In many teams, "The Admin Key" is a shared secret in a 1Password vault. When a production incident happens and an admin script is run, there is no way to know *which* human ran it. 
- **The Pitch:** `amesh` turns "Someone ran the reset-db script" into "Alice ran the reset-db script from her MacBook Pro at 10:15 AM." 
- **Impact:** This is a **Compliance/SOC2** win that doesn't require a heavy IAM system like Okta or AWS IAM.

### 2. A Second Look at CI/CD (The OIDC Bridge)
The analysis is correct that CI is ephemeral, but **OIDC Bootstrapping** changes the game. 
- **The Pattern:** A GitHub Action generates a short-lived OIDC token. It sends this to an `amesh` target. The target verifies the token (via GitHub's OIDC provider) and dynamically "pairs" that specific run.
- **The Value:** You get the `amesh` "No Static Secrets" benefit in CI without needing a persistent TPM. This solves the "Secret in GitHub Actions" problem, which is the #1 source of leaks for many teams.

### 3. Local Development (The "Dev Loop" Use Case)
We shouldn't forget the developer's local environment. If Service A calls Service B, the developer currently has to mock auth or copy a "dev" API key.
- **The Pattern:** `amesh init --backend file` on the local machine allows the dev to pair their local Service A with a local Service B instance.
- **The Value:** Dev/Prod parity. You use the exact same `amesh.fetch()` code in local dev that you use in production. No `if (process.env.NODE_ENV === 'development')` hacks for auth.

### 4. Hardware-Bound "Root of Trust" for K8s
In Kubernetes, "Secrets" are just base64 encoded strings in etcd. 
- **The Pattern:** If the K8s node has a TPM, `amesh` can provide a hardware-bound identity to a Pod that is much more secure than a standard K8s Secret.
- **The Value:** Defense-in-depth for high-security clusters. Even if the K8s API is compromised, the attacker can't "steal" the device-bound identities of the pods because they are tied to the physical node's TPM.

**Final Thought:** We should lead with **Cron Jobs**. It's the most "visceral" pain point. Every developer has a "shameful" cron job with a plaintext API key somewhere. `amesh` is the cure for that shame.

---

## Response to Gemini Feedback

### 1. "Shadow Admin" Audit Log — Yes, fold into Internal Tools

This isn't a separate use case — it's a stronger framing of the Internal Tools story. The pitch ("Someone ran the reset-db script" → "Alice ran it from her MacBook at 10:15 AM") is more concrete than what I wrote. The SOC2/compliance angle is a good sales hook that the current write-up lacks.

**Action:** When we build the Internal Tools use case page, lead with the audit trail angle and mention SOC2 explicitly. The compliance buyer is a real persona who currently reaches for Okta or AWS IAM — amesh is the lightweight alternative.

### 2. CI/CD OIDC Bridge — No, not now

Interesting idea, but it's a different product. Issues:

- **amesh's value is persistent device identity.** OIDC bootstrapping creates ephemeral session tokens — that's what GitHub Actions OIDC already does natively with AWS IAM, GCP Workload Identity, and Azure federated credentials. Teams that care about CI secret leaks already have this solved.
- **Engineering cost is high.** This requires a new protocol (OIDC verification + dynamic pairing), changes to the relay, and a new trust model (time-limited vs permanent). That's a significant pivot for a pre-v1.0 project.
- **Dilutes the core message.** amesh's story is "your machine is your identity." A CI runner is nobody's machine — it's disposable infrastructure. Trying to shoehorn amesh into ephemeral compute muddles the positioning (this is exactly why we dropped Lambda).

**Verdict:** Park this. If amesh gains traction with its core use cases, CI/CD could be a v2 expansion. But building it now would slow down the things that matter more.

### 3. Local Development — Yes, add as a cross-cutting benefit

This is the best point in the feedback. Dev/prod parity is a real pain point we didn't call out anywhere. The `--backend encrypted-file` flag we just re-added makes this work today:

```bash
# Dev machine
amesh init --name "local-service-a" --backend encrypted-file
amesh init --name "local-service-b" --backend encrypted-file
# Pair them, then use the exact same amesh.fetch() / amesh.verify() code as production
```

No `if (NODE_ENV === 'development') { skipAuth() }` hacks. Same code path everywhere.

**But it's not a standalone use case page.** It's a developer experience benefit that applies to every use case. It belongs in:
- The integration guide (as a "Local Development" section)
- Each use case page (as a "Try it locally" note)
- The README quickstart

**Action:** Add a "Local Development" section to the integration guide. Reference it from use case pages.

### 4. K8s Root of Trust — Not yet, and the model doesn't fit cleanly

The framing is appealing but the details don't work with amesh's current architecture:

- **Pods are ephemeral.** When a pod restarts on a different node, it loses access to the previous node's TPM. The identity doesn't migrate.
- **TPM is per-node, not per-pod.** Multiple pods on the same node would share one TPM identity. That's not per-service identity — it's per-machine identity reused across services. This is a worse security model than K8s service accounts.
- **Pairing requires CLI access.** You'd need to `kubectl exec` into each pod to run `amesh listen/invite`, or use bootstrap tokens — which are... static secrets. We're back to the thing amesh is supposed to replace.
- **Target audience mismatch.** The current audience is "solo devs and small teams." K8s security engineers are a different market with different expectations (they want Spiffe/Spire, not a CLI tool).

**Verdict:** Valid long-term direction if amesh evolves toward infrastructure identity (competing with Spiffe/Spire). But it requires a fundamentally different bootstrap model and multi-language SDKs. Not for now.

---

## Updated Priority Table

Incorporating the feedback:

| Priority | Use Case | Notes |
|----------|----------|-------|
| 1 | **Cron jobs** | Lead with this. Most visceral pain point. |
| 2 | **Internal tools + audit trail** | Fold in "Shadow Admin" angle. Lead with SOC2/compliance. |
| 3 | **Local development** | Cross-cutting benefit, not a standalone page. Add to integration guide. |
| 4 | **Partner API access** | Strong B2B differentiator. |
| 5 | **Edge/IoT** | Strongest hardware story. |
| 6 | **Background workers** | Valid but less differentiating. |
| — | CI/CD OIDC bridge | Parked. Different product, existing solutions. |
| — | K8s root of trust | Parked. Architecture mismatch, audience mismatch. |

