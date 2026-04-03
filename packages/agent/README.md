# @authmesh/agent

Agent daemon for [amesh](https://github.com/ameshdev/amesh) remote shell --- secure remote access using device-bound identity. Includes all CLI commands plus the agent daemon. One install on the server.

## Install

```bash
brew install ameshdev/tap/amesh-agent
# or
npm install -g @authmesh/agent
```

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
