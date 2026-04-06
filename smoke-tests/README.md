# amesh smoke tests

Post-release validation suite. Tests the **shipped artifacts** (npm registry, GitHub release binaries, relay Docker image) — not the local source tree.

## Quick start

```bash
# Run all tests against a specific release
./smoke-tests/run.sh 0.5.0

# Run a single test
./smoke-tests/run.sh 0.5.0 --test 05

# List tests without running
./smoke-tests/run.sh 0.5.0 --dry-run
```

## Requirements

- Docker (for relay + binary tests)
- Node.js 22+ (for npm install tests, runs on the host)
- `curl`, `jq`, `file` (standard CLI tools)

## Test inventory

See `manifest.json` for the machine-readable registry. Summary:

| # | Name | Category | What it validates |
|---|---|---|---|
| 01 | relay-image-boot | relay | Relay Docker image starts, `/health` returns OK |
| 02 | relay-endpoints | relay | `/ws` returns 400 without upgrade, unknown paths 404 |
| 03 | npm-install-sdk | npm | `npm install @authmesh/sdk@VERSION` with transitive deps |
| 04 | npm-exports-sdk | npm | SDK top-level + `/middleware` subpath exports |
| 05 | relay-ws-protocol | relay | Full WS pairing flow + M3 watcher hijack protection |
| 06 | relay-ws-errors | relay | Error responses: `otc_not_found`, `unknown_type`, `invalid_otc` |
| 07 | binary-download | binary | Download linux tarball from GitHub Releases |
| 08 | binary-runs | binary | `amesh --version` + `--help` from the compiled binary |
| 09 | passphrase-autogen | h2-passphrase | Auto-gen passphrase in `.passphrase` (mode 400), not `identity.json` |
| 10 | passphrase-envvar | h2-passphrase | `AUTH_MESH_PASSPHRASE` env var honoured |
| 11 | passphrase-migration | h2-passphrase | Legacy passphrase in `identity.json` migrates to `.passphrase` |

## Adding a new test

1. Create `tests/NN-name.sh` (use the next available number, leave gaps for insertability).
2. Add the standard header:
   ```bash
   #!/usr/bin/env bash
   # NAME: my-new-test
   # CATEGORY: relay | npm | binary | h2-passphrase | <new-category>
   # REQUIRES: relay | network | none
   # DESCRIPTION: One-line description
   set -euo pipefail
   source "$(dirname "$0")/../lib/assert.sh"
   ```
3. Use `assert_*` helpers from `lib/assert.sh`. Exit 0 for pass, 1 for fail, 2 for skip.
4. Add an entry to `manifest.json`.
5. Run `./smoke-tests/run.sh <version> --test NN` to verify.

## How it integrates with the deploy workflow

The `/deploy` skill runs `./smoke-tests/run.sh <version>` as Phase 8.5 — after all CI/npm/binary workflows pass and before the final status report. A smoke-test failure blocks the release from being declared "done".

## Architecture

- **Runner** (`run.sh`): discovers tests, starts the relay container when needed, runs each test, prints a summary table.
- **Tests** (`tests/*.sh`): each is a standalone bash script. Tests that need the relay declare `REQUIRES: relay` and the runner starts it before the first such test.
- **Shared libraries** (`lib/`): `assert.sh` (pass/fail/skip + comparison helpers + retry), `config.sh` (constants).
- **Manifest** (`manifest.json`): machine-readable test registry for tooling and dashboards.
