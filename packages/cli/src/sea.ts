#!/usr/bin/env node

/**
 * SEA (Single Executable Application) entry point.
 *
 * Statically imports all commands to bypass oclif's filesystem-based
 * command discovery, which doesn't work inside a single-file bundle.
 * Help is handled here; flag parsing delegates to oclif's Command.run().
 */

import Init from './commands/init.js';
import Invite from './commands/invite.js';
import List from './commands/list.js';
import Listen from './commands/listen.js';
import Provision from './commands/provision.js';
import Revoke from './commands/revoke.js';

declare const __VERSION__: string;
const VERSION = __VERSION__; // replaced at build time by esbuild

interface CommandMeta {
  run(argv?: string[]): Promise<unknown>;
  description?: string;
  flags?: Record<string, { char?: string; description?: string; required?: boolean; default?: unknown; options?: readonly string[] }>;
  args?: Record<string, { description?: string; required?: boolean }>;
}

const commands: Record<string, CommandMeta> = {
  init: Init,
  invite: Invite,
  list: List,
  listen: Listen,
  provision: Provision,
  revoke: Revoke,
};

function showHelp(): void {
  console.log(`amesh v${VERSION} — Hardware-bound M2M authentication\n`);
  console.log('Usage: amesh <command> [flags]\n');
  console.log('Commands:');
  for (const [name, cmd] of Object.entries(commands)) {
    console.log(`  ${name.padEnd(14)}${cmd.description ?? ''}`);
  }
  console.log('\nRun "amesh <command> --help" for details on a specific command.');
}

function showCommandHelp(name: string, cmd: CommandMeta): void {
  console.log(`amesh ${name} — ${cmd.description ?? ''}\n`);
  console.log(`Usage: amesh ${name} [flags]\n`);

  if (cmd.args && Object.keys(cmd.args).length > 0) {
    console.log('Arguments:');
    for (const [argName, argDef] of Object.entries(cmd.args)) {
      const req = argDef.required ? ' (required)' : '';
      console.log(`  ${argName.padEnd(18)}${argDef.description ?? ''}${req}`);
    }
    console.log('');
  }

  if (cmd.flags && Object.keys(cmd.flags).length > 0) {
    console.log('Flags:');
    for (const [flagName, flagDef] of Object.entries(cmd.flags)) {
      const short = flagDef.char ? `-${flagDef.char}, ` : '    ';
      const req = flagDef.required ? ' (required)' : '';
      const def = flagDef.default !== undefined ? ` [default: ${flagDef.default}]` : '';
      const opts = flagDef.options ? ` [${flagDef.options.join('|')}]` : '';
      console.log(`  ${short}--${flagName.padEnd(16)}${flagDef.description ?? ''}${opts}${req}${def}`);
    }
    console.log('');
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmdName = args[0];

  if (!cmdName || cmdName === '--help' || cmdName === '-h' || cmdName === 'help') {
    showHelp();
    process.exit(0);
  }

  if (cmdName === '--version' || cmdName === '-V') {
    console.log(`amesh/${VERSION}`);
    process.exit(0);
  }

  const Cmd = commands[cmdName];
  if (!Cmd) {
    console.error(`Unknown command: ${cmdName}`);
    console.error('Run "amesh --help" to see available commands.');
    process.exit(1);
  }

  const rest = args.slice(1);
  if (rest.includes('--help') || rest.includes('-h')) {
    showCommandHelp(cmdName, Cmd);
    process.exit(0);
  }

  await Cmd.run(rest);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
