# @authmesh/relay

WebSocket relay server for [amesh](https://github.com/ameshdev/amesh) device pairing handshakes.

The relay is **only needed during initial device pairing**. After two devices exchange public keys, all authentication is stateless HTTP headers --- the relay is not involved.

## Install & Run

```bash
npx @authmesh/relay                    # run directly
# or
npm install @authmesh/relay && node -e "import('@authmesh/relay').then(m => m.createRelay())"
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Listen address |
| `PORT` | `3001` | Listen port |

## Endpoints

- `GET /health` --- health check
- `WS /ws` --- WebSocket endpoint for pairing handshakes

## Rate limiting

OTC (one-time code) endpoints are rate-limited to 5 failed attempts per IP per minute.

## Programmatic usage

```typescript
import { createRelay } from '@authmesh/relay';

const server = await createRelay({ host: '0.0.0.0', port: 3001 });
```

## License

[MIT](https://github.com/ameshdev/amesh/blob/main/LICENSE)
