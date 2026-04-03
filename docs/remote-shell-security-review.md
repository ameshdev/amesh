# Remote Shell Spec — Security Review

Review of `docs/remote-shell-spec.md` against the existing codebase (`handshake.ts`, `server.ts`, protocol spec, ADRs).

---

## Verdict: Cryptographic foundation is solid. Protocol-level and operational gaps need addressing before implementation.

---

## CRITICAL — Must fix before building

### C1. Agent registration is unauthenticated

**Spec says:** Agent sends `{ type: 'agent', deviceId: 'am_...' }` to register with the relay.

**Problem:** Any attacker can send `{ type: 'agent', deviceId: 'am_VICTIM' }` and hijack the agent slot. When the controller runs `amesh shell am_VICTIM`, the relay routes them to the attacker, who receives the ECDH ephemeral key. The ECDH handshake will fail (the attacker can't produce a valid selfSig for the victim's permanent key), so no data leaks. But:

- **DoS:** Attacker squats on a deviceId, blocking the real agent from receiving shell connections.
- **Timing oracle:** Attacker learns *when* someone tries to connect to a specific device.

**Fix:** Agent registration must include a proof of identity:
```
{ type: 'agent', deviceId: 'am_...', timestamp: '...', sig: '<ECDSA sig over deviceId+timestamp>' }
```
The relay can't verify this (it doesn't have the public key), but the **controller can reject** if the subsequent handshake fails. For the DoS vector, require agents to periodically re-prove liveness, and allow the controller to retry if the first connection fails with an identity mismatch.

Better fix: the relay stores the agent's public key on registration (sent alongside deviceId) and requires controllers to include the target's public key in the `shell` request. The relay only routes if the public keys match. This prevents squatting entirely.

### C2. No shell-specific permission gate

**Spec says:** "If `amesh list` on the target shows the controller, shell access is authorized."

**Problem:** Pairing was designed for HTTP API authentication. Granting a shell is a much higher privilege level. Today, `amesh invite` pairs a controller for signing HTTP requests. After the remote shell feature ships, that same pairing silently grants full shell access. Users who paired devices for API auth did not consent to shell access.

**Fix:** Add a `shell` permission flag to allow list entries. Default to `false` for existing pairings and new pairings. Require explicit opt-in:
```bash
amesh grant am_3d9f --shell        # enable shell for this controller
amesh revoke-shell am_3d9f         # or: amesh grant am_3d9f --no-shell
```
The agent daemon checks `device.permissions.shell === true` before spawning the PTY. This is the single most important design change — without it, the feature has an implicit privilege escalation.

### C3. Relay becomes a persistent presence oracle

**Current relay:** Stateless. Sessions last ~30 seconds. An attacker monitoring the relay learns nothing about device availability.

**Shell relay:** The `agentStore` is a persistent map of `deviceId → WebSocket`. An attacker who can enumerate this (via brute-force `shell` requests) learns which devices are online, when they come online/offline, and their device IDs.

**Fix:**
- Rate-limit `shell` requests per IP (same as OTC rate limiting: 5 per minute per IP).
- Do not return `agent_not_found` vs `agent_found` — return the same response regardless and let the handshake timeout naturally if the agent isn't there. This prevents enumeration.
- Alternatively: require the controller to include a signed challenge in the `shell` request. The relay forwards it to the agent, and the agent decides whether to accept. This makes the relay a dumb pipe again.

---

## HIGH — Should fix before production use

### H1. No session idle timeout in the spec

**Spec says:** Session key lives "for the duration of the shell."

**Problem:** An abandoned shell session (controller crashes, network drops) keeps the PTY alive and the session key in memory indefinitely. The encrypted tunnel stays open on the relay, consuming resources. On the target, the PTY process runs forever.

**Fix (already in Phase 5, but should be Phase 1):**
- Idle timeout: 30 minutes default. Agent closes PTY if no frames received.
- Application-level ping/pong (spec has `0x04`/`0x05`) with 30-second interval and 90-second deadline.
- On controller disconnect: relay notifies agent, agent kills PTY immediately.
- On agent disconnect: relay notifies controller, controller restores terminal and exits.

### H2. The `-c` command mode is an injection vector

**Spec says:** `amesh shell prod-api -c "uptime"` runs a single command.

**Problem:** The command string is sent from the controller to the agent. If the agent passes it directly to a shell (`bash -c "..."`) without any validation, this is command injection by design — but that's the intended behavior (like `ssh host command`). The real risk: **the command crosses an encrypted channel, but the agent has no way to distinguish between an authorized command and a replayed/injected one.**

This is fine because:
- The channel is authenticated (ECDH + allow list check)
- Each session has a unique session key (PFS)
- Nonces are monotonic counters (no replay within a session)

However: if command whitelisting is ever added (per the permissions discussion), the whitelist check must happen on the agent side, not the controller side. The controller is untrusted — a modified client could send any command.

**No fix needed now**, but document this trust boundary clearly in the spec.

### H3. Handshake doesn't bind to device ID

**Spec says:** Controller sends `{ type: 'shell', targetDeviceId: 'am_...' }` to the relay, then does ECDH + identity exchange.

**Problem:** The relay routes based on `targetDeviceId`, but the ECDH handshake doesn't include the device IDs in the key derivation. The session key is derived from:
```
HKDF(sharedSecret, 'amesh-handshake-v1', 'session-key', 32)
```

If a MITM relay substitutes a different target (one the attacker controls), the controller would detect it during identity exchange (the permanent public key wouldn't match the allow list). So this isn't exploitable. But it would be defense-in-depth to bind the session key to the expected device IDs:
```
HKDF(sharedSecret, 'amesh-shell-v1', targetDeviceId + controllerDeviceId, 32)
```

This ensures the session key is only valid between the two intended parties, even if the ECDH shared secret were somehow identical (astronomically unlikely but theoretically possible with implementation bugs).

**Fix:** Use a different HKDF context for shell sessions (separate from pairing) that includes both device IDs. Low effort, high defense-in-depth value.

### H4. Nonce counter persisted across reconnects?

**Spec says:** Incrementing 12-byte counter starting at 0 (controller) or 0x80... (target).

**Problem:** If the WebSocket drops and reconnects, does the nonce counter reset to 0? If yes, nonce reuse with the same session key = catastrophic (ChaCha20-Poly1305 nonce reuse leaks plaintext via XOR of ciphertexts).

**Fix:** A new session = new ECDH = new session key = nonce counter resets safely. The spec should explicitly state: **there is no session resumption. A dropped connection requires a full new handshake.** This is the simplest and most secure approach. Session resumption (reusing an existing session key) is complex and error-prone — don't do it.

---

## MEDIUM — Good to fix

### M1. Agent daemon as root is too easy to do accidentally

**Spec says:** "The agent runs as the user who started it."

**Problem:** `sudo amesh agent start` gives every controller root shells. This is one `sudo` away from total compromise. SSH mitigates this with `PermitRootLogin no` in sshd_config.

**Fix:** Agent should refuse to run as root by default. Add `--allow-root` flag to override (like Docker's `--privileged`). Print a warning: "Running as root grants root shells to all authorized controllers."

### M2. Concurrent session limit needs to be per-controller

**Spec says (Phase 5):** "Max concurrent sessions per agent (configurable, default 5)."

**Problem:** If 5 is the global limit and a malicious controller (whose key is in the allow list) opens 5 sessions, legitimate controllers are locked out. DoS by an authorized-but-misbehaving peer.

**Fix:** Max sessions per controller (default 1) AND max total sessions per agent (default 5). A single controller can't monopolize all slots.

### M3. Relay traffic analysis

**Not in spec.**

**Problem:** Even though content is encrypted, the relay can observe:
- Frame sizes (maps roughly to command output length)
- Frame timing (interactive typing has a distinctive pattern)
- Session duration
- Connection times (when the user is active)

This is the same traffic analysis SSH faces over any network. It's not fixable without padding (which adds bandwidth cost).

**Recommendation:** Document this as a known limitation. For high-security use, recommend a self-hosted relay on trusted infrastructure. This matches the existing recommendation for the pairing relay.

### M4. The `-c` mode should sanitize shell metacharacters in the log

**Not in spec.**

**Problem:** The agent logs `[amesh-agent] shell opened by am_3d9f — command: uptime`. If the command contains ANSI escape sequences, it could corrupt log files or exploit log viewers (terminal escape injection).

**Fix:** Sanitize the logged command string (strip non-printable characters, truncate to 200 chars).

---

## LOW — Nice to have

### L1. No session transcript/audit log beyond connection events

The spec logs connection open/close but not what commands were run. For SOC2/compliance, session recording (like `script(1)` or Teleport's session recording) would be valuable. Not needed for v1 but worth designing the hook point.

### L2. No forward secrecy for the agent registration

The agent registers with the relay using its device ID. If the relay is compromised, the attacker knows which devices are connected. The registration itself doesn't need encryption (no secrets are transmitted), but consider using the relay's TLS connection as the confidentiality layer (wss://).

This is already the case — the default relay URL is `wss://relay.authmesh.dev/ws`.

---

## Summary Table

| ID | Severity | Issue | Effort |
|----|----------|-------|--------|
| C1 | Critical | Agent registration unauthenticated — DoS/squatting | Medium |
| C2 | Critical | No shell permission gate — implicit privilege escalation | Low |
| C3 | Critical | Relay becomes presence oracle — device enumeration | Medium |
| H1 | High | No idle timeout — resource exhaustion | Low |
| H2 | High | `-c` mode trust boundary undocumented | Low (doc only) |
| H3 | High | Session key not bound to device IDs | Low |
| H4 | High | Nonce counter reset on reconnect unclear | Low (doc only) |
| M1 | Medium | Agent as root too easy | Low |
| M2 | Medium | Session limit should be per-controller | Low |
| M3 | Medium | Traffic analysis on relay | None (doc) |
| M4 | Medium | Log injection via command string | Low |

**Recommendation:** Fix C1, C2, C3 in the spec before any code is written. They are design-level issues, not implementation bugs. H1-H4 should be addressed in Phase 1, not deferred to Phase 5.
