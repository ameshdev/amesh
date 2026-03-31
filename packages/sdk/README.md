# @authmesh/sdk

Signing fetch client and verification middleware for [amesh](https://github.com/ameshdev/amesh) --- hardware-bound M2M authentication that replaces API keys.

## Install

```bash
npm install @authmesh/sdk
```

## Sign requests (client)

```typescript
import { amesh } from '@authmesh/sdk';

// Drop-in replacement for fetch() — signs every request automatically
const res = await amesh.fetch('https://api.example.com/orders', {
  method: 'POST',
  body: JSON.stringify({ amount: 100 }),
});
```

`amesh.fetch()` loads your device identity from `~/.amesh/`, signs the request with your hardware-bound P-256 key, and adds the `Authorization` header.

## Verify requests (server)

```typescript
import express from 'express';
import { amesh } from '@authmesh/sdk';

const app = express();
app.use(express.text({ type: '*/*' }));

// One line — checks signature, timestamp, nonce, and allow list
app.use(amesh.verify());

app.get('/api/data', (req, res) => {
  // req.authMesh.deviceId   — unique device identifier
  // req.authMesh.friendlyName — human-readable name
  // req.authMesh.verifiedAt — verification timestamp
  res.json({ ok: true, device: req.authMesh.deviceId });
});
```

## Redis nonce store (production)

For multi-instance deployments, use the Redis nonce store to prevent replay attacks across instances:

```typescript
import { amesh } from '@authmesh/sdk';
import { RedisNonceStore } from '@authmesh/sdk/redis';

app.use(amesh.verify({
  nonceStore: new RedisNonceStore('redis://localhost:6379'),
}));
```

## Configuration

| Environment variable | Description |
|---------------------|-------------|
| `AUTH_MESH_DIR` | Override `~/.amesh/` directory |
| `AUTH_MESH_PASSPHRASE` | Passphrase for encrypted-file keystore |

## Full documentation

- [Guide](https://github.com/ameshdev/amesh/blob/main/docs/guide.md)
- [Protocol Spec](https://github.com/ameshdev/amesh/blob/main/docs/protocol-spec.md)

## License

[MIT](https://github.com/ameshdev/amesh/blob/main/LICENSE)
