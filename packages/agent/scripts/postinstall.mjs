#!/usr/bin/env node
/**
 * Postinstall for @authmesh/agent.
 *
 * Downloads the prebuilt amesh-agent binary for the current platform from
 * the matching GitHub release tarball, extracts it into bin/, and marks it
 * executable. If no binary exists for this platform (e.g. linux-armv7, or a
 * pre-release where binaries haven't been uploaded yet), falls back to the
 * JS entry point which surfaces a helpful "requires Bun runtime" error.
 *
 * This script runs on `npm install @authmesh/agent`. It must exit 0 even on
 * failure so install doesn't break CI — unsupported architectures still get
 * a working package, just one that requires Bun manually installed.
 */

import { createWriteStream, existsSync, mkdirSync, chmodSync, readFileSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, '..');
const binDir = join(pkgRoot, 'bin');

// Load package version so we target the matching release tag.
const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf-8'));
const VERSION = pkg.version;

// GitHub release URL pattern: amesh-{VERSION}-{platform}-{arch}.tar.gz
const REPO = 'ameshdev/amesh';

// Map Node.js process.platform + process.arch → the release tarball suffix.
// Any combination not in this map is considered unsupported.
const PLATFORM_MAP = {
  'darwin-arm64': 'darwin-arm64',
  'darwin-x64': 'darwin-x64',
  'linux-x64': 'linux-x64',
  'linux-arm64': 'linux-arm64',
};

function log(...args) {
  console.log('[@authmesh/agent postinstall]', ...args);
}

function warn(...args) {
  console.warn('[@authmesh/agent postinstall]', ...args);
}

async function main() {
  // Skip in CI environments where lifecycle scripts are disabled or where the
  // user explicitly opted out (same pattern esbuild uses).
  if (process.env.AMESH_SKIP_POSTINSTALL === '1') {
    log('AMESH_SKIP_POSTINSTALL=1 set, skipping binary download.');
    return;
  }

  const key = `${process.platform}-${process.arch}`;
  const suffix = PLATFORM_MAP[key];

  if (!suffix) {
    warn(
      `No prebuilt binary available for ${key}. The JS entry point will be used,\n` +
        '  which requires Bun runtime on this machine. Install Bun:\n' +
        '    curl -fsSL https://bun.sh/install | bash\n' +
        `  Then run as: bun $(which amesh-agent) agent start`,
    );
    return;
  }

  const tarballName = `amesh-${VERSION}-${suffix}.tar.gz`;
  const url = `https://github.com/${REPO}/releases/download/v${VERSION}/${tarballName}`;

  log(`Downloading prebuilt amesh-agent binary for ${key}...`);
  log(`  ${url}`);

  mkdirSync(binDir, { recursive: true });
  const tmpTar = join(tmpdir(), `${tarballName}.${process.pid}`);
  const tmpExtract = join(tmpdir(), `amesh-agent-extract-${process.pid}`);

  try {
    // Stream download via native fetch (Node 18+).
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    if (!res.body) {
      throw new Error('empty response body');
    }
    await pipeline(res.body, createWriteStream(tmpTar));

    // Extract the tarball to a tmp dir and move just the amesh-agent binary.
    mkdirSync(tmpExtract, { recursive: true });
    execFileSync('tar', ['-xzf', tmpTar, '-C', tmpExtract]);

    const extractedBin = join(tmpExtract, 'amesh-agent');
    if (!existsSync(extractedBin)) {
      throw new Error(`amesh-agent binary not found in ${tarballName}`);
    }

    const finalBin = join(binDir, 'amesh-agent');
    renameSync(extractedBin, finalBin);
    chmodSync(finalBin, 0o755);
    log(`Installed → ${finalBin}`);
  } catch (err) {
    warn(
      `Binary download failed: ${err instanceof Error ? err.message : String(err)}\n` +
        '  Falling back to the JS entry point, which requires Bun runtime:\n' +
        '    curl -fsSL https://bun.sh/install | bash\n' +
        '    bun $(which amesh-agent) agent start',
    );
  } finally {
    if (existsSync(tmpTar)) unlinkSync(tmpTar);
  }
}

main().catch((err) => {
  // Never fail the install. Print a warning and exit 0.
  warn('Unexpected error:', err instanceof Error ? err.message : String(err));
  process.exit(0);
});
