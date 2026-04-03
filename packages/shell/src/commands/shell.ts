#!/usr/bin/env bun
import { connectShell } from '../shell.js';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  console.log(`
  amesh-shell — Open a secure remote shell to a paired device

  USAGE
    amesh-shell <device-id-or-name> [flags]

  ARGUMENTS
    device    Device ID (am_...) or friendly name of the target

  FLAGS
    -c <command>           Run a single command and exit
    --relay <url>          Relay URL (default: wss://relay.authmesh.dev/ws)
    -h, --help             Show help

  EXAMPLES
    amesh-shell prod-api                    # interactive shell
    amesh-shell am_7f2e8a1b -c "uptime"    # single command

  ENVIRONMENT
    AUTH_MESH_DIR          Override ~/.amesh/ directory
    AUTH_MESH_PASSPHRASE   Passphrase for encrypted-file backend
    AMESH_RELAY_URL        Override default relay URL
`);
  process.exit(0);
}

const target = args[0];
const command = getFlag(args, '-c');
const relayUrl = getFlag(args, '--relay') ?? process.env.AMESH_RELAY_URL ?? 'wss://relay.authmesh.dev/ws';

const exitCode = await connectShell({ target, relayUrl, command });
process.exit(exitCode);

function getFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}
