# @authmesh/core

P-256 ECDSA crypto primitives for [amesh](https://github.com/ameshdev/amesh) --- hardware-bound M2M authentication.

## Install

```bash
npm install @authmesh/core
```

## What's inside

- **`signMessage` / `verifyMessage`** --- P-256 ECDSA signing and verification (raw r||s, 64 bytes)
- **`buildCanonicalString`** --- deterministic request canonicalization (method, path, timestamp, nonce, body)
- **`InMemoryNonceStore`** --- replay detection with configurable TTL
- **`computeHmac` / `verifyHmac`** --- HMAC-SHA256 for allow list integrity
- **`hkdfDerive`** --- HKDF-SHA256 key derivation
- **`ephemeralEcdh`** --- P-256 ECDH for handshake tunnel encryption

Most users should use [`@authmesh/sdk`](https://github.com/ameshdev/amesh/tree/main/packages/sdk) instead --- it wraps these primitives into a simple `amesh.fetch()` / `amesh.verify()` API.

## Usage

```typescript
import { signMessage, verifyMessage, buildCanonicalString } from '@authmesh/core';

const canonical = buildCanonicalString('POST', '/api/orders', timestamp, nonce, body);
const signature = signMessage(privateKey, new TextEncoder().encode(canonical));
const valid = verifyMessage(signature, new TextEncoder().encode(canonical), publicKey);
```

## License

[MIT](https://github.com/ameshdev/amesh/blob/main/LICENSE)
