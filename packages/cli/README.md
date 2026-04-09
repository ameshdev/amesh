# @authmesh/cli

Unified CLI for [amesh](https://github.com/ameshdev/amesh) — device identity, remote shell, and file transfer.

## Install

```bash
npm install -g @authmesh/cli
```

## Commands

```bash
amesh init --name "prod-api"     # Create a device identity
amesh listen --shell             # Start pairing + grant shell access
amesh invite <code>              # Join pairing (controller side)
amesh list                       # Show trusted devices
amesh revoke <device-id>         # Remove a trusted device
amesh provision                  # Generate bootstrap tokens
amesh grant <device-id> --shell  # Grant shell access to a controller
amesh grant <device-id> --files  # Grant file transfer access
amesh shell <device>             # Open remote shell to a target
amesh cp <src> <device:/path>    # Copy files to a target
amesh agent start                # Start the agent daemon (target side)
amesh agent stop                 # Stop the agent daemon
amesh reset                      # Clear stale sessions
```

## Pairing flow

On the target machine:
```bash
$ amesh listen --shell
  Pairing code: 482916

  Controller connected.
  Enter the 6-digit code shown on the Controller.
  Verification code: 847291
  "Dev Laptop" added as controller.
  Shell access: granted
```

On the controller:
```bash
$ amesh invite 482916
  Connected to relay.
  Verification code: 847291
  Waiting for target to confirm verification code...
  "prod-api" added as target.
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
