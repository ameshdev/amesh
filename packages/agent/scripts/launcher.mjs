#!/usr/bin/env node
/**
 * Launcher for @authmesh/agent.
 *
 * This is the `bin` entry that npm symlinks as `amesh-agent`. If a prebuilt
 * binary exists at ../bin/amesh-agent (placed there by the postinstall script),
 * exec it directly and pass through all arguments. Otherwise fall back to the
 * JS oclif entry which surfaces the Bun runtime requirement.
 *
 * Using a wrapper here is what makes the package work on platforms where we
 * ship binaries (most users) while still leaving a working-ish install on
 * unsupported platforms.
 */

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, '..');

const prebuilt = join(pkgRoot, 'bin', 'amesh-agent');

if (existsSync(prebuilt)) {
  const result = spawnSync(prebuilt, process.argv.slice(2), {
    stdio: 'inherit',
  });
  process.exit(result.status ?? 1);
}

// Fall back to the oclif JS entry point. This path requires Bun runtime and
// will surface a clear error if run under Node.js (see commands/agent/start.ts).
await import('../dist/index.js');
