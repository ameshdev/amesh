# @authmesh/shell

Secure remote shell for [amesh](https://github.com/ameshdev/amesh) --- SSH-like access using device-bound identity. No SSH keys, no authorized_keys, instant per-device revocation.

## Install

```bash
brew install ameshdev/tap/amesh-shell
# or
npm install -g @authmesh/shell
```

You also need `@authmesh/cli` for pairing and permissions:
```bash
brew install ameshdev/tap/amesh
```

## Usage

### On the target (server)

```bash
# Grant shell access to a controller (one-time)
amesh grant am_3d9f1a2e --shell

# Start the agent daemon
amesh-agent start
```

### On the controller (your laptop)

```bash
# Interactive shell
amesh-shell prod-api

# Single command
amesh-shell prod-api -c "uptime"
```

## Security

- End-to-end encrypted (ChaCha20-Poly1305, ephemeral ECDH per session)
- Device-ID-bound session keys (HKDF domain separation)
- Shell access is opt-in (`amesh grant --shell`), not automatic from pairing
- Agent refuses to run as root without `--allow-root`
- HMAC-sealed allow list with tamper detection
- One-way trust: controllers access targets, never the reverse

## Environment variables

| Variable | Description |
|----------|-------------|
| `AUTH_MESH_DIR` | Override `~/.amesh/` directory |
| `AUTH_MESH_PASSPHRASE` | Passphrase for encrypted-file backend |
| `AMESH_RELAY_URL` | Override default relay URL |

## Full documentation

- [Remote Shell Guide](https://github.com/ameshdev/amesh/blob/main/docs/remote-shell-spec.md)

## License

[MIT](https://github.com/ameshdev/amesh/blob/main/LICENSE)
