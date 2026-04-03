#!/usr/bin/env bun
import { startAgent } from '../agent.js';

const args = process.argv.slice(2);
const flags = {
  relayUrl: getFlag(args, '--relay') ?? process.env.AMESH_RELAY_URL ?? 'wss://relay.authmesh.dev/ws',
  allowRoot: args.includes('--allow-root'),
  idleTimeoutMinutes: parseInt(getFlag(args, '--idle-timeout') ?? '30', 10),
};

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
  amesh-agent start — Run the amesh shell agent daemon

  USAGE
    amesh-agent start [flags]

  FLAGS
    --relay <url>          Relay URL (default: wss://relay.authmesh.dev/ws)
    --idle-timeout <min>   Idle session timeout in minutes (default: 30)
    --allow-root           Allow running as root (grants root shells)
    -h, --help             Show help

  ENVIRONMENT
    AUTH_MESH_DIR          Override ~/.amesh/ directory
    AUTH_MESH_PASSPHRASE   Passphrase for encrypted-file backend
    AMESH_RELAY_URL        Override default relay URL
`);
  process.exit(0);
}

startAgent({
  relayUrl: flags.relayUrl,
  allowRoot: flags.allowRoot,
  idleTimeoutMinutes: flags.idleTimeoutMinutes,
});

function getFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}
