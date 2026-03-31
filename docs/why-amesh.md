# Why amesh exists

This document explains the real problems amesh solves and why the current approach to machine-to-machine authentication is broken.

---

## The problem: static secrets

Almost every backend service authenticates other services using static strings — API keys, Bearer tokens, shared secrets, JWT signing keys. These strings are stored in `.env` files, environment variables, secrets managers, or config files.

This model has a fundamental flaw: **the secret IS the identity.** Anyone who has the string is authenticated. There is no way to prove *which machine* used it, whether it was copied, or where it's been.

---

## Real failures this causes

### 1. Secrets leak constantly

GitHub's secret scanning detected over **1 million leaked secrets in public repos in 2024 alone.** This includes API keys, database credentials, and cloud provider tokens. These aren't just mistakes by juniors — Uber, Samsung, Toyota, and Twitch have all had major secret leaks.

Common leak vectors:
- `.env` committed to git (`.gitignore` missed or not set up)
- Secrets printed to logs during debugging and pushed to CloudWatch/Datadog
- Docker images containing `.env` files pushed to public registries
- Postman collections shared with hardcoded Bearer tokens
- CI/CD build logs capturing environment variable expansions
- Developers sharing API keys in Slack/email ("just use this for now")

**amesh eliminates this entire class of leaks.** There is no string to leak. The private key is generated on the device and never exported. You can commit your entire codebase to a public repo and nothing is compromised.

### 2. Rotation is painful and dangerous

When a secret is compromised (or your compliance team mandates 90-day rotation), you face a coordination problem:

1. Generate new API key
2. Update it in every service that uses it
3. Deploy all services simultaneously (or accept a window where some use the old key)
4. Hope nothing breaks
5. Revoke the old key
6. Discover a forgotten service is still using the old key
7. Emergency fix at 2am

This is operationally expensive and error-prone. Teams delay rotation because the risk of breaking production feels higher than the risk of a compromised key.

**amesh has no rotation.** Device keys don't expire. They are cryptographically bound to the device. If a device is compromised, you revoke it instantly with `amesh revoke` — and only that device loses access. Every other device continues working.

### 3. No identity — only access

A Bearer token doesn't tell you *who* is calling. If three servers and a developer laptop all share the same API key, your API sees identical requests from all four. You can't:

- Audit which machine made a specific request
- Rate-limit per device
- Revoke one machine without affecting the others
- Detect if the key was copied to an unauthorized machine

**amesh gives every machine a unique, verifiable identity.** When a request arrives, the server knows exactly which device sent it (`req.authMesh.deviceId`), its friendly name, and when it was verified. If one machine is compromised, you revoke it by device ID — the others are unaffected.

### 4. Secrets managers add complexity, not security

Services like AWS Secrets Manager, HashiCorp Vault, and Doppler improve *management* of secrets but don't solve the fundamental problem: the secret still exists as a copyable string that must be fetched, held in memory, and sent over the wire.

A secrets manager:
- Adds a dependency (if Vault is down, your service can't authenticate)
- Still delivers the secret as a string to your application
- Requires its own authentication (how does your server authenticate to Secrets Manager? With... another secret)
- Adds latency on every cold start
- Costs money at scale

**amesh removes the secret entirely.** There is no string to manage, fetch, cache, or protect. The signing happens on the device. The only thing that crosses the wire is a cryptographic signature that is useless to an attacker — it's bound to a specific request, timestamp, and nonce.

### 5. No proof of origin

With Bearer tokens, a server has no way to prove that a request came from a specific machine. The token proves the caller *knows the secret* — but that secret could have been copied to any machine, any container, any attacker's laptop.

This matters for:
- **Compliance** (SOC 2, PCI DSS) — auditors want proof that only authorized machines accessed production data
- **Incident response** — when a breach is detected, you need to identify the exact source
- **Zero-trust architecture** — "never trust, always verify" requires verifiable machine identity, not shared passwords

**amesh provides cryptographic proof of origin.** Each request is signed with a key that never leaves the device. The signature proves the specific device sent the request, at a specific time, with a specific body. This is non-repudiable — the device can't deny it sent the request, and no other device could have produced the same signature.

---

## What changes with amesh

| | Static API keys | amesh |
|---|---|---|
| **What proves identity** | A string anyone can copy | A device-bound private key that never leaves the machine |
| **What crosses the wire** | The secret itself | A signature (useless if captured) |
| **If compromised** | Attacker has full access until key is rotated | Key is on the device — attacker needs physical access |
| **Rotation** | Manual, risky, coordinated across services | Not needed. Revoke per device if compromised |
| **Revocation** | Breaks everything using that key | Revokes one device. Others unaffected |
| **Audit trail** | "Someone with this key called the API" | "Device am_8f3a (prod-api-east) called the API at 10:05:32" |
| **Replay protection** | None (same token works forever) | Every request has a unique nonce + 30-second timestamp window |
| **What to protect** | .env files, CI variables, Vault access, Slack threads | Physical access to the machine (same as SSH keys, passkeys) |
| **What you store in git** | Nothing (and hope you never accidentally do) | Everything. There are no secrets in the codebase |

---

## Who this is for

**Today:** Solo developers and small teams running APIs or microservices who currently manage secrets in `.env` files and want to stop worrying about leaks. Works on macOS (Keychain / Secure Enclave) and Linux (TPM 2.0).

**The use case:** Any time Machine A needs to prove to Machine B that it is authorized to call an API. Examples:

- A server calling your internal API
- A cron job hitting a payment service
- Microservices authenticating to each other
- A webhook sender proving its identity to a receiver

**Not for (yet):** Consumer login, browser-based authentication, mobile apps. amesh is specifically for machine-to-machine authentication.

---

## The security model in one sentence

**The private key never leaves the device. The signature proves the machine. The nonce prevents replay. The HMAC prevents tampering. The SAS prevents MITM. One-way trust limits blast radius — a compromised target cannot authenticate back to its controller.**

There is no string to steal.
