/**
 * Build script for Bun single-executable binary.
 *
 * Usage:
 *   bun packaging/build-bun.mjs [--target bun-darwin-arm64]
 *
 * Compiles packages/cli/src/sea.ts into a standalone binary via `bun build --compile`.
 * On macOS targets, also compiles the Swift Secure Enclave helper.
 * Default target: current platform.
 */

import { readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { platform } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const distDir = join(__dirname, 'dist');

const pkg = JSON.parse(
  readFileSync(join(root, 'packages/cli/package.json'), 'utf-8'),
);

// Parse --target flag from argv (e.g., --target bun-darwin-arm64)
const args = process.argv.slice(2);
const targetIdx = args.indexOf('--target');
const target = targetIdx !== -1 ? args[targetIdx + 1] : null;

const isDarwinTarget = target ? target.includes('darwin') : platform() === 'darwin';

mkdirSync(distDir, { recursive: true });

// --- Build the main CLI binary ---
const outfile = join(distDir, 'amesh');

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

// --- Build Swift helper for macOS targets ---
if (isDarwinTarget) {
  const swiftDir = join(root, 'packages/keystore/swift');
  const helperOut = join(distDir, 'amesh-se-helper');

  console.log('\nCompiling amesh-se-helper (Swift)...');
  execFileSync('swiftc', [
    '-O',
    '-o', helperOut,
    join(swiftDir, 'main.swift'),
  ], { stdio: 'inherit' });

  console.log(`Done → ${helperOut}`);
} else {
  console.log('\nSkipping Swift helper (non-macOS target).');
}
