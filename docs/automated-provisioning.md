# amesh: Automated Provisioning Spec
**Version:** 1.0.0  
**Status:** Implementation Spec  
**Scope:** `@authmesh/cli` — `amesh provision` command + bootstrap token flow  
**Prerequisite:** `amesh-spec-v1.md`, `amesh-hardware-key-storage.md`, `amesh-redis-nonce-adapter.md`

---

## Why This Exists

The current pairing flow requires a human at a terminal. A developer runs `amesh listen` on the target, sees a 6-digit code, then runs `amesh invite --code 123456` on the controller. This works for a server you can SSH into.

It does not work for:

- **AWS Lambda** — no persistent process, no terminal, function only exists when invoked
- **Docker containers** — built from a Dockerfile, no interactive session at build time
- **GitHub Actions / CI pipelines** — automated runners, no human present
- **Kubernetes pods** — spun up by an orchestrator, not a person
- **Vercel / Netlify functions** — fully managed, zero shell access

These are not edge cases. They are the majority of where production APIs live in 2026.

This spec defines a **bootstrap token** — a short-lived signed credential a controller generates once, embeds in the environment of a target, and the target uses on first boot to complete the handshake automatically. After that single bootstrap, the target has a permanent hardware-bound identity and the token is worthless.

---

## Scope of This Spec

**In scope:**
- `amesh provision` CLI command (generates a bootstrap token)
- Bootstrap token format and signing
- Target-side auto-pairing on first boot (`AMESH_BOOTSTRAP_TOKEN` env var)
- Token expiry and single-use enforcement
- Integration with the existing handshake flow
- Security constraints and threat model

**Out of scope:**
- Token revocation before use (tokens expire — let them expire)
- Bulk provisioning of many devices at once (future)
- Non-environment-variable token delivery (file, API, etc.) — document as possible, not built
- Dashboard UI for managing provisioned devices

---

## Mental Model

Think of the bootstrap token as a **signed invitation letter**. It says:

> "I, the controller device `am_8f3a...`, authorize any device that presents this letter before `2026-03-30T12:00:00Z` to join my mesh with the name `prod-lambda-us-east-1`. This letter is valid for one use only."

The letter is signed by the controller's private key. Anyone can verify it came from the controller. But it is time-limited and single-use — possessing it after it's been used, or after it expires, gains the attacker nothing.

---

## The Bootstrap Token

### Format

The token is a compact, URL-safe string with three dot-separated parts:

```
amesh-bt-v1.<Base64URL(header)>.<Base64URL(payload)>.<Base64URL(signature)>
```

The `amesh-bt-v1.` prefix makes bootstrap tokens visually identifiable and prevents accidental use as other credential types.

### Header

```json
{
  "typ": "amesh-bootstrap",
  "ver": "1",
  "alg": "ES256"
}
```

- `typ` — token type, always `"amesh-bootstrap"` for this spec
- `ver` — bootstrap token format version, always `"1"` for this spec
- `alg` — signing algorithm, `"ES256"` (P-256 ECDSA with SHA-256)

### Payload

```json
{
  "iss": "am_8f3a9b2c1d4e5f6a",
  "iat": 1743160800,
  "exp": 1743164400,
  "jti": "bt_7f3a1b2c",
  "name": "prod-lambda-us-east-1",
  "relay": "wss://relay.amesh.dev/ws",
  "scope": "peer:add",
  "single_use": true
}
```

| Field | Type | Description |
|---|---|---|
| `iss` | string | Device ID of the issuing controller |
| `iat` | number | Issued at (Unix timestamp, seconds) |
| `exp` | number | Expiry (Unix timestamp, seconds). Maximum 24 hours from `iat`. |
| `jti` | string | JWT ID — unique token identifier. Used for single-use enforcement. |
| `name` | string | Friendly name to assign to the provisioned device |
| `relay` | string | WebSocket relay URL to use for the automated handshake |
| `scope` | string | Always `"peer:add"` in this spec. Reserved for future permission scoping. |
| `single_use` | boolean | Always `true` in this spec. Token is invalidated after first successful use. |

### Signature

The signature covers `Base64URL(header) + "." + Base64URL(payload)`, signed with the controller's hardware-bound P-256 private key. Same key used for request signing — no new key material needed.

### Full Token Example

```
amesh-bt-v1.eyJ0eXAiOiJhbWVzaC1ib290c3RyYXAiLCJ2ZXIiOiIxIiwiYWxnIjoiRVMyNTYifQ.eyJpc3MiOiJhbV84ZjNhOWIyYzFkNGU1ZjZhIiwiaWF0IjoxNzQzMTYwODAwLCJleHAiOjE3NDMxNjQ0MDAsImp0aSI6ImJ0XzdmM2ExYjJjIiwibmFtZSI6InByb2QtbGFtYmRhLXVzLWVhc3QtMSIsInJlbGF5Ijoid3NzOi8vcmVsYXkuYXV0aC1tZXNoLmRldi93cyIsInNjb3BlIjoicGVlcjphZGQiLCJzaW5nbGVfdXNlIjp0cnVlfQ.BASE64URL_SIGNATURE
```

---

## The Full Provisioning Flow

### Phase 1: Controller generates the token

```
Developer's laptop (Controller)
│
├── amesh provision --name "prod-lambda-us-east-1" --ttl 1h
│
├── Loads controller's identity from ~/.amesh/identity.json
├── Generates unique jti: "bt_" + 8 random hex chars
├── Builds header + payload JSON
├── Signs with hardware-bound private key (Secure Enclave / TPM)
├── Encodes as amesh-bt-v1.<header>.<payload>.<sig>
├── Records jti in local ~/.amesh/issued_tokens.json
│   (for optional audit trail — not used for enforcement)
│
└── Outputs token to stdout
```

```bash
$ amesh provision --name "prod-lambda-us-east-1" --ttl 1h

  Bootstrap token generated.
  
  Token (valid for 1 hour, single use):
  
  amesh-bt-v1.eyJ0eXAiOiJhbWVzaC1ib290c3RyYXAi...
  
  Usage:
    Set this as an environment variable on the target:
    AMESH_BOOTSTRAP_TOKEN=amesh-bt-v1.eyJ0eXAi...
  
  On first boot, the target will pair automatically.
  The token is invalidated after use.
  
  ⚠  Treat this token like a password until it is used.
     After first use, it is permanently worthless.
```

### Phase 2: Token is delivered to the target

The developer embeds the token in the target's environment. The delivery mechanism is outside the protocol — `amesh` does not prescribe it. Common patterns:

**AWS Lambda:**
```bash
aws lambda update-function-configuration \
  --function-name my-api \
  --environment Variables={AMESH_BOOTSTRAP_TOKEN=amesh-bt-v1...}
```

**Docker:**
```dockerfile
# Set at build time (acceptable — token is short-lived)
# Or at runtime via docker run -e (preferred)
ENV AMESH_BOOTSTRAP_TOKEN=amesh-bt-v1...
```

**GitHub Actions:**
```yaml
env:
  AMESH_BOOTSTRAP_TOKEN: ${{ secrets.AMESH_BOOTSTRAP_TOKEN }}
```

**Kubernetes:**
```yaml
env:
  - name: AMESH_BOOTSTRAP_TOKEN
    valueFrom:
      secretKeyRef:
        name: amesh-secrets
        key: bootstrap-token
```

### Phase 3: Target detects token on first boot

On startup, the `@authmesh/sdk` checks for `AMESH_BOOTSTRAP_TOKEN`. If present and the device has no existing identity, it triggers the automated pairing flow.

```
Target (Lambda / Container)
│
├── Process starts
├── SDK checks: AMESH_BOOTSTRAP_TOKEN env var present?
├── SDK checks: ~/.amesh/identity.json exists?
│   If identity exists → skip bootstrap, token is ignored
│   If no identity → begin automated pairing
│
├── Parse and validate the bootstrap token (locally):
│   ├── Decode header, payload, signature
│   ├── Check typ === "amesh-bootstrap"
│   ├── Check ver === "1"  
│   ├── Check exp > now (not expired)
│   └── Defer signature verification to Phase 4
│       (need controller's public key, obtained via relay)
│
├── Generate own Ed25519/P-256 keypair
│   (using best available backend per platform detection)
│
├── Connect to relay URL from token payload
├── Send bootstrap initiation message:
│   {
│     "type": "bootstrap_init",
│     "jti": "<token_jti>",
│     "targetPubKey": "<Base64URL_target_public_key>"
│   }
│
└── Wait for controller response (timeout: 30 seconds)
```

### Phase 4: Relay notifies controller, controller responds

The relay does not validate the token. It forwards the `bootstrap_init` message to the controller identified by `iss` in the token — but the controller has to be listening.

**This is the key design constraint:** The controller must be running `amesh provision-watch` (or have the SDK's bootstrap listener active) to respond to automated pairing requests.

```
Relay
│
├── Receives bootstrap_init with jti: "bt_7f3a1b2c"
├── Does NOT validate the token — it is a dumb relay
├── Looks up if any controller is watching for this jti
│   (controllers register their jti watch on the relay when they issue a token)
├── Forwards bootstrap_init to watching controller
└── Waits for controller's response to forward back
```

```
Controller (Developer's laptop — must be running)
│
├── Receives bootstrap_init from relay
├── Validates the full token:
│   ├── Decodes and verifies own signature on the token
│   ├── Checks jti hasn't been used before
│   │   (checks local ~/.amesh/used_tokens.json)
│   ├── Checks exp > now
│   └── Checks target's claimed public key is well-formed
│
├── If valid:
│   ├── Records jti in ~/.amesh/used_tokens.json (single-use enforcement)
│   ├── Adds target's public key to own allow_list.json
│   ├── Reseals allow_list HMAC
│   └── Sends bootstrap_ack to relay:
│       {
│         "type": "bootstrap_ack",
│         "controllerPubKey": "<Base64URL_controller_public_key>",
│         "controllerSig": "<signature_over_targetPubKey+jti>"
│       }
│
└── If invalid (expired, already used, malformed):
    └── Sends bootstrap_reject with error code
```

### Phase 5: Target receives ack, completes pairing

```
Target
│
├── Receives bootstrap_ack from relay
├── Verifies controllerSig:
│   signature must cover (targetPubKey + jti)
│   signed by the public key matching iss in the token
│   This proves the controller is the legitimate issuer
│
├── Verifies the token signature using controllerPubKey
│   (now we have the controller's public key to verify against)
│
├── If all checks pass:
│   ├── Writes own identity to ~/.amesh/identity.json
│   ├── Adds controller's public key to own allow_list.json
│   ├── Reseals allow_list HMAC
│   ├── Clears AMESH_BOOTSTRAP_TOKEN from process environment
│   │   (prevent token leakage in child processes)
│   └── Logs: "Bootstrap complete. Identity: am_xxxx"
│
├── Disconnects from relay
│   (relay connection is never needed again)
│
└── Proceeds with normal startup
```

---

## The `provision-watch` Problem

Phase 4 requires the controller to be online and watching for bootstrap requests. This is the most significant UX constraint in the provisioning flow.

Three approaches, in order of preference:

### Option A: Background daemon (recommended for MVP)

`amesh provision` automatically starts a background watch process after generating the token. The daemon listens on the relay for `jti` responses and exits after the token is used or expires.

```bash
$ amesh provision --name "prod-lambda-us-east-1" --ttl 1h

  Token generated. Watching for bootstrap requests...
  (This process will exit after the token is used or in 1 hour)

  amesh-bt-v1.eyJ0eXAi...

  Press Ctrl+C to cancel. The token will remain valid but unattended.
```

The developer can leave this running in a terminal tab while deploying. Clean, explicit, no background magic.

### Option B: Explicit `amesh provision-watch` command

Token generation and watching are separate commands. Useful for scripting:

```bash
# Terminal 1: Generate token
TOKEN=$(amesh provision --name "prod-lambda" --ttl 1h --no-watch)

# Terminal 2: Start watching (can be started before or after generation)
amesh provision-watch

# Deploy with $TOKEN, then wait for bootstrap_ack in Terminal 2
```

### Option C: Push-based (future)

Controller registers a webhook URL. When the relay receives a `bootstrap_init`, it calls the webhook instead of needing a persistent WebSocket connection from the controller. This eliminates the "controller must be online" requirement but adds infrastructure complexity. Out of scope for MVP.

**MVP ships Option A.** Option B is a free byproduct of the same code. Option C is documented as future work.

---

## Single-Use Enforcement

Token reuse is prevented at the controller level, not the relay level.

```typescript
// ~/.amesh/used_tokens.json
{
  "used": [
    {
      "jti": "bt_7f3a1b2c",
      "usedAt": "2026-03-29T11:05:00Z",
      "usedBy": "am_1a2b3c4d5e6f7a8b"
    }
  ]
}
```

When the controller receives a `bootstrap_init`:
1. Check `jti` against `used_tokens.json`
2. If found → send `bootstrap_reject { error: "token_already_used" }`
3. If not found → proceed, then immediately write `jti` to `used_tokens.json`

This file is NOT HMAC-sealed. A tampered `used_tokens.json` could allow token reuse — but only the controller itself is writing and reading this file, and an attacker with write access to the controller's filesystem has bigger problems. The HMAC protection is reserved for `allow_list.json` because that file is what gatekeeps authentication.

Expired tokens are also ignored. The `exp` check in Phase 3 and Phase 4 provides a second layer of defense. A token cannot be used after its expiry regardless of whether `used_tokens.json` has been cleared.

---

## CLI Commands

### `amesh provision`

```
USAGE
  amesh provision [OPTIONS]

OPTIONS
  --name, -n     <string>   Friendly name for the device being provisioned (required)
  --ttl,  -t     <duration> Token validity period. Format: 1h, 30m, 24h. Max: 24h. Default: 1h
  --relay        <url>      Override relay URL. Default: wss://relay.amesh.dev/ws
  --no-watch                Generate token only, do not start watch daemon
  --output, -o   <format>   Output format: "text" (default) or "json"
  --help, -h                Show help

EXAMPLES
  amesh provision --name "prod-lambda-us-east-1"
  amesh provision --name "ci-runner" --ttl 30m
  amesh provision --name "staging-api" --ttl 24h --output json
  TOKEN=$(amesh provision --name "worker" --no-watch --output json | jq -r .token)
```

**JSON output** (for scripting):
```json
{
  "token": "amesh-bt-v1.eyJ0eXAi...",
  "jti": "bt_7f3a1b2c",
  "name": "prod-lambda-us-east-1",
  "issuedAt": "2026-03-29T10:00:00Z",
  "expiresAt": "2026-03-29T11:00:00Z",
  "relay": "wss://relay.amesh.dev/ws"
}
```

### `amesh provision-watch`

```
USAGE
  amesh provision-watch [OPTIONS]

OPTIONS
  --timeout, -t  <duration> How long to watch. Default: matches longest active token TTL
  --help, -h                Show help

DESCRIPTION
  Listens for incoming bootstrap requests from provisioned targets.
  Automatically started by `amesh provision` unless --no-watch is set.
  Exits when all active tokens are used or expired.
```

---

## SDK Integration — Target Side

Developers using the SDK do not need to call provisioning code directly. The SDK handles it automatically at middleware initialization.

### Auto-Bootstrap in Express / Fastify

```typescript
// server.ts
import { authMeshVerify, bootstrapIfNeeded } from '@authmesh/sdk';
import { RedisNonceStore } from '@authmesh/sdk/redis';

// Call before setting up routes
// Checks AMESH_BOOTSTRAP_TOKEN and runs pairing if needed
await bootstrapIfNeeded({
  onComplete: (identity) => {
    console.log(`amesh ready. Device ID: ${identity.deviceId}`);
  },
  onError: (err) => {
    console.error('amesh bootstrap failed:', err.message);
    process.exit(1); // fail hard — do not start without identity
  },
  timeoutSeconds: 30,
});

const nonceStore = new RedisNonceStore({ redisUrl: process.env.REDIS_URL });
app.use('/api', authMeshVerify({ nonceStore }));
```

### Auto-Bootstrap in Lambda

```typescript
// handler.ts
import { bootstrapIfNeeded } from '@authmesh/sdk';

// Lambda execution environment persists across warm invocations
// Bootstrap runs once on cold start, no-ops on subsequent calls
let bootstrapPromise: Promise<void> | null = null;

async function ensureBootstrapped() {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrapIfNeeded({ timeoutSeconds: 25 });
  }
  await bootstrapPromise;
}

export const handler = async (event: APIGatewayEvent) => {
  await ensureBootstrapped();
  // ... rest of handler
};
```

### `bootstrapIfNeeded` Behavior

```typescript
export async function bootstrapIfNeeded(options: BootstrapOptions): Promise<void> {
  const token = process.env.AMESH_BOOTSTRAP_TOKEN;
  const identityExists = await checkIdentityExists(); // reads ~/.amesh/identity.json

  if (!token && !identityExists) {
    throw new Error(
      'No amesh identity found and no AMESH_BOOTSTRAP_TOKEN set.\n' +
      'Run `amesh init` on this machine or set AMESH_BOOTSTRAP_TOKEN.'
    );
  }

  if (!token && identityExists) {
    return; // already provisioned, nothing to do
  }

  if (token && identityExists) {
    console.warn('[amesh] AMESH_BOOTSTRAP_TOKEN is set but identity already exists. Ignoring token.');
    return;
  }

  // token present, no identity — run bootstrap
  await runBootstrap(token!, options);
}
```

---

## Security Threat Model

### What the bootstrap token protects against

| Threat | Mitigation |
|---|---|
| Token intercepted in transit | Token expires (max 24h). Single-use — first use wins. |
| Expired token replayed | `exp` check on both controller and target |
| Token used twice | `jti` recorded in `used_tokens.json` after first use |
| Fake controller responds to bootstrap_init | `controllerSig` proves controller holds private key matching `iss` |
| Target substitutes its own public key | `controllerSig` covers `targetPubKey + jti` — controller signs the target's specific key |
| Relay intercepts and modifies messages | `controllerSig` verification on target side detects tampering |
| Attacker generates their own token | Token is signed by controller's hardware-bound private key — unforgeable without the key |

### What the bootstrap token does NOT protect against

**The controller must be online during bootstrap.** If the controller is offline, the target cannot complete pairing. An attacker who times a bootstrap attempt to the controller's offline window can force a timeout — causing a denial of service for that pairing attempt. The developer simply re-provisions with a new token.

**The `AMESH_BOOTSTRAP_TOKEN` env var is sensitive until used.** After first use it is worthless, but before use it grants the ability to add a device to the mesh. It must be treated with the same care as an API key — use secret management systems (AWS Secrets Manager, GitHub Secrets, Kubernetes Secrets), not plaintext config files.

**Token TTL is the attack window.** A stolen, unused token can be used by an attacker until it expires. Keep TTLs short. Use `--ttl 30m` for most cases. Only extend to `24h` when deployment pipelines require it.

---

## The `bootstrapIfNeeded` State Machine

```
                    ┌─────────────────────────────┐
                    │         Process Start        │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │  AMESH_BOOTSTRAP_TOKEN set?  │
                    └──────┬───────────────┬───────┘
                           │ NO            │ YES
              ┌────────────▼──┐        ┌───▼──────────────┐
              │ Identity      │        │ Identity          │
              │ exists?       │        │ exists?           │
              └──┬─────────┬──┘        └───┬──────────┬────┘
                 │ YES     │ NO            │ YES      │ NO
                 ▼         ▼               ▼          ▼
              [READY]  [ERROR:         [WARN:      [BOOTSTRAP]
                        no identity,   token        │
                        no token]      ignored]     │
                                                    ▼
                                            ┌───────────────┐
                                            │ Parse token   │
                                            │ Check exp     │
                                            │ Check format  │
                                            └───────┬───────┘
                                                    │ valid
                                            ┌───────▼───────┐
                                            │ Generate      │
                                            │ keypair       │
                                            └───────┬───────┘
                                                    │
                                            ┌───────▼───────┐
                                            │ Connect relay │
                                            │ Send          │
                                            │ bootstrap_init│
                                            └───────┬───────┘
                                                    │
                                      ┌─────────────▼──────────────┐
                                      │   Wait for ack (30s max)   │
                                      └──────┬──────────────┬───────┘
                                             │ ACK          │ timeout/reject
                                    ┌────────▼──────┐    ┌──▼────────────┐
                                    │ Verify        │    │ ERROR:        │
                                    │ controllerSig │    │ bootstrap     │
                                    │ Verify token  │    │ failed        │
                                    │ sig           │    └───────────────┘
                                    └────────┬──────┘
                                             │ valid
                                    ┌────────▼──────┐
                                    │ Write identity│
                                    │ Write         │
                                    │ allow_list    │
                                    │ Clear env var │
                                    └────────┬──────┘
                                             │
                                          [READY]
```

---

## Testing Strategy

### Unit Tests

```typescript
// packages/cli/src/commands/provision.test.ts

describe('Bootstrap Token Generation', () => {
  it('generates a valid token structure', async () => {
    const token = await generateBootstrapToken({
      name: 'test-device',
      ttlSeconds: 3600,
      relay: 'wss://relay.test',
      issuerDeviceId: 'am_test123',
    });
    expect(token).toMatch(/^amesh-bt-v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it('payload contains all required fields', async () => {
    const { payload } = await generateAndDecodeToken({ name: 'test', ttlSeconds: 3600 });
    expect(payload.typ).toBe('amesh-bootstrap'); // wait — typ is in header, not payload
    expect(payload.iss).toBeDefined();
    expect(payload.exp).toBeGreaterThan(payload.iat);
    expect(payload.jti).toMatch(/^bt_[a-f0-9]{8}$/);
    expect(payload.single_use).toBe(true);
    expect(payload.scope).toBe('peer:add');
  });

  it('exp is within max 24 hours of iat', async () => {
    const { payload } = await generateAndDecodeToken({ name: 'test', ttlSeconds: 86400 });
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(86400);
  });

  it('rejects ttl over 24 hours', async () => {
    await expect(generateBootstrapToken({ ttlSeconds: 86401 }))
      .rejects.toThrow('ttl cannot exceed 24 hours');
  });

  it('each token has a unique jti', async () => {
    const t1 = await generateAndDecodeToken({ name: 'a', ttlSeconds: 3600 });
    const t2 = await generateAndDecodeToken({ name: 'b', ttlSeconds: 3600 });
    expect(t1.payload.jti).not.toBe(t2.payload.jti);
  });
});

describe('Bootstrap Token Validation', () => {
  it('rejects an expired token', async () => {
    const token = await generateBootstrapToken({ ttlSeconds: -1 }); // already expired
    await expect(validateToken(token)).rejects.toThrow('token_expired');
  });

  it('rejects a token with invalid signature', async () => {
    const token = await generateBootstrapToken({ ttlSeconds: 3600 });
    const tampered = token.slice(0, -5) + 'XXXXX'; // corrupt signature
    await expect(validateToken(tampered)).rejects.toThrow('invalid_signature');
  });

  it('rejects a token with wrong type', async () => {
    // Manually construct a token with typ: "wrong"
    await expect(validateToken(buildTokenWithTyp('wrong'))).rejects.toThrow('invalid_token_type');
  });

  it('rejects a used token', async () => {
    const token = await generateBootstrapToken({ ttlSeconds: 3600 });
    const { payload } = decodeToken(token);
    await markTokenUsed(payload.jti, 'am_test');
    await expect(validateToken(token)).rejects.toThrow('token_already_used');
  });
});

describe('bootstrapIfNeeded', () => {
  it('no-ops when identity exists and no token set', async () => {
    const result = await bootstrapIfNeeded({ identityExists: true, token: undefined });
    expect(result).toBe('ready');
  });

  it('throws when no identity and no token', async () => {
    await expect(bootstrapIfNeeded({ identityExists: false, token: undefined }))
      .rejects.toThrow('No amesh identity');
  });

  it('warns and no-ops when token set but identity exists', async () => {
    const warnSpy = vi.spyOn(console, 'warn');
    await bootstrapIfNeeded({ identityExists: true, token: 'amesh-bt-v1...' });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('already exists'));
  });
});
```

### Integration Tests

```typescript
// packages/cli/src/commands/provision.integration.test.ts
// Requires: relay server running locally

describe('Full bootstrap flow (integration)', () => {
  it('target pairs successfully with valid token', async () => {
    // 1. Controller generates token
    const { token } = await runCLI('provision --name test-device --ttl 5m --no-watch --output json');

    // 2. Start controller watch in background
    const watchProcess = startCLI('provision-watch');

    // 3. Target runs bootstrapIfNeeded with the token
    const identity = await runBootstrapAsTarget(token);

    // 4. Verify target has identity and controller has target in allow list
    expect(identity.deviceId).toMatch(/^am_/);
    const controllerAllowList = await loadAllowList();
    expect(controllerAllowList.devices.map(d => d.deviceId)).toContain(identity.deviceId);

    watchProcess.kill();
  });

  it('rejects bootstrap with expired token', async () => {
    const expiredToken = await generateExpiredToken(); // exp = now - 1
    await expect(runBootstrapAsTarget(expiredToken)).rejects.toThrow('token_expired');
  });

  it('rejects second bootstrap with same token', async () => {
    const { token } = await runCLI('provision --name one-shot --ttl 5m --no-watch --output json');
    const watchProcess = startCLI('provision-watch');

    await runBootstrapAsTarget(token); // succeeds
    await expect(runBootstrapAsTarget(token)).rejects.toThrow('token_already_used');

    watchProcess.kill();
  });

  it('times out when controller is not watching', async () => {
    const { token } = await runCLI('provision --name abandoned --ttl 5m --no-watch --output json');
    // No provision-watch running
    await expect(runBootstrapAsTarget(token, { timeoutSeconds: 3 }))
      .rejects.toThrow('bootstrap_timeout');
  });
});
```

---

## Build Order for the Week

| Day | Task | Done When |
|---|---|---|
| **Mon** | Bootstrap token format. `generateBootstrapToken()`. `decodeToken()`. Unit tests. | Token round-trips. All format unit tests pass. |
| **Tue** | `validateToken()`. Single-use enforcement via `used_tokens.json`. Token validation unit tests. | Expired, tampered, reused tokens all rejected correctly. |
| **Wed** | `amesh provision` CLI command. Option A daemon (background watch). `--output json` flag. | `amesh provision --name x --ttl 1h` outputs a valid token and starts watching. |
| **Thu** | `bootstrapIfNeeded()` SDK function. State machine implementation. Auto-clear env var. | `bootstrapIfNeeded` state machine passes all unit tests. Lambda pattern works. |
| **Fri** | Full integration test: token → provision-watch → target bootstrap → both allow lists updated. `docs/automated-provisioning.md`. | Integration test green against local relay. CI passes. |

---

## Exit Criteria for This Week

Before moving to the demo:

- [ ] `generateBootstrapToken()` produces tokens matching the specified format
- [ ] `validateToken()` correctly rejects: expired, tampered, wrong type, already used
- [ ] `amesh provision` command works end-to-end with `--output json` for scripting
- [ ] Provision-watch daemon starts automatically and exits cleanly after token is used
- [ ] `bootstrapIfNeeded()` handles all four state machine branches correctly
- [ ] Full integration test passes: controller provisions → target bootstraps → both have correct allow lists
- [ ] Env var is cleared from process environment after successful bootstrap
- [ ] Token TTL max of 24 hours is enforced at generation time
- [ ] `docs/automated-provisioning.md` written with AWS Lambda and Docker examples
- [ ] `jti` uniqueness guaranteed (test: generate 1000 tokens, all `jti` values unique)

---

## What This Unlocks

After this week, amesh works for:

| Deployment type | Before this spec | After this spec |
|---|---|---|
| Single server (SSH access) | ✅ Works via interactive handshake | ✅ Still works |
| Docker container | ❌ No terminal at build time | ✅ `AMESH_BOOTSTRAP_TOKEN` env var |
| AWS Lambda | ❌ No persistent process | ✅ Cold-start bootstrap |
| GitHub Actions CI runner | ❌ No interactive session | ✅ Secret → env var → auto-pairs |
| Kubernetes pod | ❌ Orchestrator-managed | ✅ Kubernetes Secret → env var |

The entire serverless and container ecosystem becomes a valid deployment target. This is what makes amesh a complete M2M solution rather than a tool that only works with servers you can SSH into.

---

*End of amesh-automated-provisioning.md*  
*Next document: `amesh-demo.md` (the five-minute developer demo)*