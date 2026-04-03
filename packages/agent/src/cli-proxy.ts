#!/usr/bin/env bun
/**
 * Re-exports the amesh CLI so that `npm install -g @authmesh/agent` provides the `amesh` command.
 * The agent package is a superset of the CLI.
 */
import { execute } from '@oclif/core';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve to @authmesh/cli's dist directory for oclif command discovery
const cliPkg = import.meta.resolve('@authmesh/cli/package.json');
const cliDir = dirname(fileURLToPath(cliPkg));

await execute({ dir: join(cliDir, 'dist') });
