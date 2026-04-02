# @authmesh/cli

CLI for [amesh](https://github.com/ameshdev/amesh) device identity management.

## Install

```bash
npm install -g @authmesh/cli
```

## Commands

```bash
amesh init --name "prod-api"     # Create a device identity
amesh listen                     # Start pairing (target side)
amesh invite <code>              # Join pairing (controller side)
amesh list                       # Show trusted devices
amesh revoke <device-id>         # Remove a trusted device
amesh provision                  # Generate bootstrap tokens
```

## Pairing flow

On the target machine:
```bash
$ amesh listen
  Pairing code: 482916

  Controller connected.
  Verification code: 847291
  Codes match? (Y/n): y
  "Dev Laptop" added to allow list.
```

On the controller:
```bash
$ amesh invite 482916
  Connected to relay.
  Verification code: 847291
  Codes match? (Y/n): y
  "prod-api" added to allow list.
```

## Environment variables

| Variable | Description |
|----------|-------------|
| `AUTH_MESH_DIR` | Override `~/.amesh/` directory |
| `AMESH_RELAY_URL` | WebSocket relay URL (default: `wss://relay.authmesh.dev/ws`) |

## Full documentation

- [Guide](https://github.com/ameshdev/amesh/blob/main/docs/guide.md)

## License

[MIT](https://github.com/ameshdev/amesh/blob/main/LICENSE)
