#!/usr/bin/env node

/**
 * SEA (Single Executable Application) entry point.
 *
 * Statically imports all commands to bypass oclif's filesystem-based
 * command discovery, which doesn't work inside a single-file bundle.
 * Help is handled here; flag parsing delegates to oclif's Command.run().
 *
 * oclif requires a valid package.json root to initialize. Since compiled
 * binaries don't have a filesystem, we create a minimal one at startup.
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import Init from './commands/init.js';
import Invite from './commands/invite.js';
import List from './commands/list.js';
import Listen from './commands/listen.js';
import Provision from './commands/provision.js';
import Revoke from './commands/revoke.js';

declare const __VERSION__: string;
const VERSION = __VERSION__; // replaced at build time by bun

interface CommandMeta {
  run(argv?: string[], opts?: string): Promise<unknown>;
  description?: string;
  flags?: Record<
    string,
    {
      char?: string;
      description?: string;
      required?: boolean;
      default?: unknown;
      options?: readonly string[];
    }
  >;
  args?: Record<string, { description?: string; required?: boolean }>;
}

const topLevelCommands: Record<string, CommandMeta> = {
  init: Init,
  invite: Invite,
  list: List,
  listen: Listen,
  provision: Provision,
  revoke: Revoke,
};

const nestedCommands: Record<string, Record<string, CommandMeta>> = {};

/**
 * Create a minimal oclif root so Config.load() works in compiled binaries.
 * Without this, oclif tries to find package.json at the build-time path.
 */
function getOclifRoot(): string {
  const root = join(tmpdir(), 'amesh-oclif');
  const pjsonPath = join(root, 'package.json');
  if (!existsSync(pjsonPath)) {
    mkdirSync(root, { recursive: true });
    writeFileSync(
      pjsonPath,
      JSON.stringify({
        name: '@authmesh/cli',
        version: VERSION,
        oclif: { bin: 'amesh' },
      }),
    );
  }
  return root;
}

function showHelp(): void {
  console.log(`amesh v${VERSION} — Device-bound M2M authentication\n`);
  console.log('Usage: amesh <command> [flags]\n');
  console.log('Commands:');
  for (const [name, cmd] of Object.entries(topLevelCommands)) {
    console.log(`  ${name.padEnd(14)}${cmd.description ?? ''}`);
  }
  for (const [topic, subs] of Object.entries(nestedCommands)) {
    for (const [sub, cmd] of Object.entries(subs)) {
      console.log(`  ${`${topic} ${sub}`.padEnd(14)}${cmd.description ?? ''}`);
    }
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
      console.log(
        `  ${short}--${flagName.padEnd(16)}${flagDef.description ?? ''}${opts}${req}${def}`,
      );
    }
    console.log('');
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const first = args[0];

  if (!first || first === '--help' || first === '-h' || first === 'help') {
    showHelp();
    process.exit(0);
  }

  if (first === '--version' || first === '-V') {
    console.log(`amesh/${VERSION}`);
    process.exit(0);
  }

  const oclifRoot = getOclifRoot();

  // Nested commands (e.g. `amesh <topic> <sub> [flags]`)
  const nested = nestedCommands[first];
  if (nested) {
    const sub = args[1];
    if (!sub || sub === '--help' || sub === '-h') {
      console.log(`amesh ${first} — subcommands:\n`);
      for (const [name, cmd] of Object.entries(nested)) {
        console.log(`  ${name.padEnd(14)}${cmd.description ?? ''}`);
      }
      process.exit(0);
    }
    const Cmd = nested[sub];
    if (!Cmd) {
      console.error(`Unknown subcommand: ${first} ${sub}`);
      console.error(`Run "amesh ${first} --help" to see available subcommands.`);
      process.exit(1);
    }
    const rest = args.slice(2);
    if (rest.includes('--help') || rest.includes('-h')) {
      showCommandHelp(`${first} ${sub}`, Cmd);
      process.exit(0);
    }
    await Cmd.run(rest, oclifRoot);
    return;
  }

  // Top-level commands
  const Cmd = topLevelCommands[first];
  if (!Cmd) {
    console.error(`Unknown command: ${first}`);
    console.error('Run "amesh --help" to see available commands.');
    process.exit(1);
  }

  const rest = args.slice(1);
  if (rest.includes('--help') || rest.includes('-h')) {
    showCommandHelp(first, Cmd);
    process.exit(0);
  }

  await Cmd.run(rest, oclifRoot);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
