# Self-Hosting Guide

How to run your own amesh relay server. The relay is only needed for device pairing — after two devices exchange public keys, all authentication is stateless HTTP headers with no relay involved.

---

## Architecture

```
PAIRING (one-time, needs relay):
  Device A  <--WebSocket-->  Your Relay  <--WebSocket-->  Device B

RUNTIME (every request, no relay):
  Device A  ----HTTP + AuthMesh header---->  Device B
```

The relay is stateless. It holds WebSocket connections in memory during a pairing session (typically 10-30 seconds) and forgets everything when the session ends. No database, no persistence.

---

## Option 1: Docker

The simplest way to self-host.

```bash
git clone https://github.com/ameshdev/amesh.git
cd amesh
docker compose up -d
```

The relay starts on port 3001. Health check: `curl http://localhost:3001/health`

To use it for pairing:
```bash
# On machine A
amesh listen --relay ws://your-server:3001/ws

# On machine B
amesh invite 482916 --relay ws://your-server:3001/ws
```

### Build the image separately

```bash
docker build -f Dockerfile.relay -t amesh-relay .
docker run -p 3001:3001 amesh-relay
```

---

## Option 2: Google Cloud Run

Scales to zero — no cost when nobody is pairing. Supports WebSockets natively.

### Deploy

```bash
# Build and push the container
gcloud builds submit --tag gcr.io/YOUR_PROJECT/amesh-relay -f Dockerfile.relay .

# Deploy to Cloud Run
gcloud run deploy amesh-relay \
  --image gcr.io/YOUR_PROJECT/amesh-relay \
  --port 3001 \
  --allow-unauthenticated \
  --session-affinity \
  --min-instances 0 \
  --max-instances 3 \
  --region us-central1
```

The `--session-affinity` flag is important — it ensures WebSocket connections stay on the same instance during a pairing session.

### Custom domain

```bash
gcloud run domain-mappings create \
  --service amesh-relay \
  --domain relay.yourdomain.com \
  --region us-central1
```

---

## Option 3: Fly.io

```bash
# Create fly.toml
cat > fly.toml << 'EOF'
app = "amesh-relay"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile.relay"

[env]
  PORT = "3001"

[http_service]
  internal_port = 3001
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0

[[services]]
  protocol = "tcp"
  internal_port = 3001

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

  [[services.http_checks]]
    interval = 10000
    grace_period = "5s"
    method = "get"
    path = "/health"
EOF

fly launch
fly deploy
```

---

## Option 4: Plain Node.js

No Docker required. Install the relay package and run it.

```bash
npm install @authmesh/relay
```

```bash
# Run directly
PORT=3001 HOST=0.0.0.0 bunx @authmesh/relay
```

Or in your own script:

```typescript
import { createRelayServer } from '@authmesh/relay';

const relay = await createRelayServer({ host: '0.0.0.0', port: 3001 });
await relay.start();
console.log('Relay listening on ws://0.0.0.0:3001/ws');
```

### Run with systemd (Linux)

```ini
# /etc/systemd/system/amesh-relay.service
[Unit]
Description=amesh relay server
After=network.target

[Service]
Type=simple
User=amesh
Environment=PORT=3001
Environment=HOST=0.0.0.0
ExecStart=/usr/bin/bunx @authmesh/relay
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable amesh-relay
sudo systemctl start amesh-relay
```

---

## Option 5: Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: amesh-relay
spec:
  replicas: 1
  selector:
    matchLabels:
      app: amesh-relay
  template:
    metadata:
      labels:
        app: amesh-relay
    spec:
      containers:
        - name: relay
          image: ghcr.io/ameshdev/amesh-relay:latest
          ports:
            - containerPort: 3001
          env:
            - name: PORT
              value: "3001"
          readinessProbe:
            httpGet:
              path: /health
              port: 3001
            initialDelaySeconds: 2
---
apiVersion: v1
kind: Service
metadata:
  name: amesh-relay
spec:
  type: ClusterIP
  selector:
    app: amesh-relay
  ports:
    - port: 3001
      targetPort: 3001
```

---

## Configuration

| Environment variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | `3001` | Listen port |
| `HOST` | `0.0.0.0` | Listen address |

The relay has no other configuration. It is stateless and requires no database, no secrets, and no external services.

---

## Security

The relay is designed to be untrusted:

- **All key exchange is encrypted** — the relay forwards opaque ChaCha20-Poly1305 blobs, it cannot read the content
- **SAS verification prevents MITM** — even if someone controls the relay, both devices display a 6-digit code that must match. A MITM attack would produce different codes.
- **Rate limiting** — 5 failed OTC attempts per IP per minute
- **No persistence** — nothing is stored. Sessions exist only in memory during the ~30 second pairing window.

You can safely run the relay on shared infrastructure. A compromised relay cannot break the security of the pairing protocol.

---

## Using the Public Relay

amesh provides a free public relay at `relay.authmesh.dev` for getting started. This is the default when no `--relay` flag is provided.

The public relay has the same security guarantees as a self-hosted one — it cannot read the key exchange or perform MITM attacks. However, for production use we recommend self-hosting for availability guarantees.

---

## Monitoring

Health check endpoint: `GET /health`

```json
{ "status": "ok", "sessions": 2 }
```

The `sessions` count shows active pairing sessions. This should normally be 0 or very low — each pairing takes ~30 seconds.
