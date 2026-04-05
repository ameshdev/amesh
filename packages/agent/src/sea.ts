#!/usr/bin/env bun

/**
 * SEA (Single Executable Application) entry point for amesh-agent.
 *
 * Statically imports all commands to bypass oclif's filesystem-based
 * command discovery, which doesn't work inside a Bun-compiled binary
 * (/$bunfs has no package.json for oclif to locate).
 *
 * Mirrors packages/cli/src/sea.ts but adds the nested `agent start` subcommand.
 * The shebang is #!/usr/bin/env bun because the agent requires Bun for PTY
 * support (Bun.spawn with terminal mode) — the compiled binary bundles Bun
 * directly so end users don't need it installed.
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import Grant from './commands/grant.js';
import Init from './commands/init.js';
import Invite from './commands/invite.js';
import List from './commands/list.js';
import Listen from './commands/listen.js';
import Provision from './commands/provision.js';
import Revoke from './commands/revoke.js';
import Shell from './commands/shell.js';
import AgentStart from './commands/agent/start.js';

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
  grant: Grant,
  init: Init,
  invite: Invite,
  list: List,
  listen: Listen,
  provision: Provision,
  revoke: Revoke,
  shell: Shell,
};

// Nested commands under `amesh-agent <topic> <subcommand>`.
const nestedCommands: Record<string, Record<string, CommandMeta>> = {
  agent: {
    start: AgentStart,
  },
};

function getOclifRoot(): string {
  const root = join(tmpdir(), 'amesh-agent-oclif');
  const pjsonPath = join(root, 'package.json');
  if (!existsSync(pjsonPath)) {
    mkdirSync(root, { recursive: true });
    writeFileSync(
      pjsonPath,
      JSON.stringify({
        name: '@authmesh/agent',
        version: VERSION,
        oclif: { bin: 'amesh-agent' },
      }),
    );
  }
  return root;
}

function showHelp(): void {
  console.log(`amesh-agent v${VERSION} — Remote shell target daemon + CLI\n`);
  console.log('Usage: amesh-agent <command> [flags]\n');
  console.log('Commands:');
  for (const [name, cmd] of Object.entries(topLevelCommands)) {
    console.log(`  ${name.padEnd(14)}${cmd.description ?? ''}`);
  }
  for (const [topic, subs] of Object.entries(nestedCommands)) {
    for (const [sub, cmd] of Object.entries(subs)) {
      console.log(`  ${`${topic} ${sub}`.padEnd(14)}${cmd.description ?? ''}`);
    }
  }
  console.log('\nRun "amesh-agent <command> --help" for details on a specific command.');
}

function showCommandHelp(name: string, cmd: CommandMeta): void {
  console.log(`amesh-agent ${name} — ${cmd.description ?? ''}\n`);
  console.log(`Usage: amesh-agent ${name} [flags]\n`);

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
    console.log(`amesh-agent/${VERSION}`);
    process.exit(0);
  }

  const oclifRoot = getOclifRoot();

  // Nested commands: `amesh-agent agent start [flags]`
  const nested = nestedCommands[first];
  if (nested) {
    const sub = args[1];
    if (!sub || sub === '--help' || sub === '-h') {
      console.log(`amesh-agent ${first} — subcommands:\n`);
      for (const [name, cmd] of Object.entries(nested)) {
        console.log(`  ${name.padEnd(14)}${cmd.description ?? ''}`);
      }
      process.exit(0);
    }
    const Cmd = nested[sub];
    if (!Cmd) {
      console.error(`Unknown subcommand: ${first} ${sub}`);
      console.error(`Run "amesh-agent ${first} --help" to see available subcommands.`);
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
    console.error('Run "amesh-agent --help" to see available commands.');
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
