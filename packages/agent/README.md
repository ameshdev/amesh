# @authmesh/agent

Agent daemon for [amesh](https://github.com/ameshdev/amesh) remote shell --- secure remote access using device-bound identity. Install on the server (target) to accept shell connections from paired controllers.

## Install

```bash
brew install ameshdev/tap/amesh-agent
# or
npm install -g @authmesh/agent
```

You also need `@authmesh/cli` on the server for identity setup and pairing:
```bash
brew install ameshdev/tap/amesh
```

## Setup

```bash
# Create identity + pair with controller (one-time)
amesh init --name "prod-api"
amesh listen
# Controller runs: amesh invite <code>

# Grant shell access to the controller
amesh grant am_3d9f1a2e --shell

# Start the agent daemon
amesh-agent start
```

## Usage

```bash
amesh-agent start                          # foreground
amesh-agent start --idle-timeout 60        # custom timeout (minutes)
amesh-agent start --relay wss://...        # custom relay
amesh-agent start --allow-root             # run as root (danger)
```

## Security

- Shell access requires explicit `amesh grant --shell` (not automatic from pairing)
- End-to-end encrypted (ChaCha20-Poly1305, ephemeral ECDH per session)
- Refuses to run as root without `--allow-root`
- Per-controller session limits
- HMAC-sealed allow list with tamper detection

## Environment variables

| Variable | Description |
|----------|-------------|
| `AUTH_MESH_DIR` | Override `~/.amesh/` directory |
| `AUTH_MESH_PASSPHRASE` | Passphrase for encrypted-file backend |
| `AMESH_RELAY_URL` | Override default relay URL |

## License

[MIT](https://github.com/ameshdev/amesh/blob/main/LICENSE)
