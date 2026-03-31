/**
 * Build script for Node.js SEA (Single Executable Application).
 *
 * 1. Bundles packages/cli/src/sea.ts → packaging/dist/amesh-sea.cjs via esbuild
 * 2. Injects the version from packages/cli/package.json
 *
 * After running this script, use the Node.js SEA toolchain:
 *   node --experimental-sea-config packaging/sea-config.json
 *   cp $(which node) amesh
 *   npx postject amesh NODE_SEA_BLOB packaging/dist/amesh-sea.blob \
 *     --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
 */

import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const pkg = JSON.parse(
  readFileSync(join(root, 'packages/cli/package.json'), 'utf-8'),
);

await build({
  entryPoints: [join(root, 'packages/cli/src/sea.ts')],
  outfile: join(__dirname, 'dist/amesh-sea.cjs'),
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node24',
  minify: true,
  sourcemap: false,
  define: {
    __VERSION__: JSON.stringify(pkg.version),
  },
  banner: {
    js: '// amesh CLI — Single Executable Application bundle',
  },
});

console.log(`Bundled amesh v${pkg.version} → packaging/dist/amesh-sea.cjs`);
