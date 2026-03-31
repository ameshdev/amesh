/**
 * Build script for Bun single-executable binary.
 *
 * Usage:
 *   bun packaging/build-bun.mjs [--target bun-darwin-arm64]
 *
 * Compiles packages/cli/src/sea.ts into a standalone binary via `bun build --compile`.
 * Default target: current platform.
 */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const pkg = JSON.parse(
  readFileSync(join(root, 'packages/cli/package.json'), 'utf-8'),
);

// Parse --target flag from argv (e.g., --target bun-darwin-arm64)
const args = process.argv.slice(2);
const targetIdx = args.indexOf('--target');
const target = targetIdx !== -1 ? args[targetIdx + 1] : null;

const outfile = join(__dirname, 'dist', 'amesh');

const cmd = [
  'build',
  join(root, 'packages/cli/src/sea.ts'),
  '--compile',
  '--minify',
  '--define', `__VERSION__=${JSON.stringify(pkg.version)}`,
  '--outfile', outfile,
  ...(target ? ['--target', target] : []),
];

console.log(`Building amesh v${pkg.version}...`);
console.log(`  bun ${cmd.join(' ')}`);

execFileSync('bun', cmd, { stdio: 'inherit', cwd: root });

console.log(`\nDone → ${outfile}`);
