# @authmesh/agent

Agent daemon for [amesh](https://github.com/ameshdev/amesh) remote shell — secure remote access using device-bound identity. Includes all CLI commands plus the agent daemon. One install on the server.

## Install

```bash
npm install -g @authmesh/agent
```

On install, a postinstall script downloads the prebuilt `amesh-agent` binary for your platform (macOS arm64/x64, Linux x64/arm64) from the matching GitHub release. The binary bundles Bun, so no runtime install is needed on supported platforms.

**Platform support:** macOS (arm64, x64) and Linux (x64, arm64 — including Raspberry Pi 4/5 on 64-bit Pi OS). Linux armv7 (Raspberry Pi 3 and earlier, 32-bit Pi OS) is not supported because Bun does not ship for that architecture; on those systems, install [Bun](https://bun.com/docs/installation) manually and run as `bun $(which amesh-agent) agent start`.

## Setup

```bash
amesh-agent init --name "prod-api"
amesh-agent listen
# Controller runs: amesh invite <code>

amesh-agent grant am_3d9f1a2e --shell
amesh-agent agent start
```

## Commands

All CLI commands plus the agent daemon:

```bash
amesh-agent init --name "prod-api"     # Create device identity
amesh-agent listen                     # Start pairing (target side)
amesh-agent invite <code>              # Join pairing
amesh-agent list                       # Show paired devices
amesh-agent revoke <device-id>         # Remove a device
amesh-agent grant <device-id> --shell  # Grant shell access
amesh-agent provision                  # Generate bootstrap tokens
amesh-agent shell <device>             # Open remote shell
amesh-agent agent start                # Start the agent daemon
```

## License

[MIT](https://github.com/ameshdev/amesh/blob/main/LICENSE)
