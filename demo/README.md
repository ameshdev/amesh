# amesh demo

Replace an API key with hardware-bound cryptographic identity. No `.env` file. No Bearer token. No shared secret.

## What this demo does

1. Starts an API server with a protected route
2. Calls it from a client using `amesh.fetch()` — no secrets anywhere
3. Shows a replay attack being blocked

## Setup

You need two terminal windows and the amesh CLI.

### 1. Initialize identity

```bash
# From the repo root — requires macOS Keychain or TPM
alias amesh="node $(pwd)/packages/cli/dist/index.js"

amesh init --name "demo-device"
```

### 2. Add a trusted device to the allow list

For the demo, both server and client run on the same machine with the same identity. In production, you'd pair two machines with `amesh listen` + `amesh invite`.

### 3. Install demo dependencies

```bash
cd demo
bun install
```

### 4. Start the server

```bash
bun run server.ts
```

### 5. Run the client

In another terminal:

```bash
bun run call.ts
```

## What you'll see

```
  amesh demo — client

  -- Step 1: Public endpoint (no auth) --
  Status:            200
  Response:          {"status":"ok","auth":"amesh"}

  -- Step 2: Protected without auth (expect 400) --
  Status:            400
  Response:          {"error":"missing_header"}

  -- Step 3: Signed GET with amesh.fetch() --
  Status:            200
  Device:            {"deviceId":"am_...","friendlyName":"demo-device"}
  Orders:            [{"id":"ord_001",...}]

  -- Step 4: Signed POST with amesh.fetch() --
  Status:            201
  Order:             {"order":{"id":"ord_x7f3a2","item":"Standing Desk",...}}

  -- Step 5: Replay attack (expect 401 on second) --
  First request:     200
  Replay attempt:    401
  Replay rejected. Nonce store working.

  -- Done --
  No API key. No Bearer token. No .env file.
  The private key never left this machine.
```

## Files

```
demo/
  server.ts    — API server. Zero secrets. Find one if you can.
  call.ts      — Client. Signs requests with amesh.fetch(). No key string.
  package.json
  README.md
```
