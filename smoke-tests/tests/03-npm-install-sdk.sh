#!/usr/bin/env bash
# NAME: npm-install-sdk
# CATEGORY: npm
# REQUIRES: network
# DESCRIPTION: npm install @authmesh/sdk@VERSION succeeds with transitive deps at the same version
set -euo pipefail
source "$(dirname "$0")/../lib/assert.sh"

if ! command -v npm &>/dev/null; then
  skip "npm not available"
fi

WORKDIR=$(mktemp -d)
trap "rm -rf $WORKDIR" EXIT
cd "$WORKDIR"

npm init -y --silent >/dev/null 2>&1
retry 3 10 npm install "@authmesh/sdk@${VERSION}" --silent >/dev/null 2>&1

# SDK itself
assert_file_exists "node_modules/@authmesh/sdk/dist/index.js" "SDK dist/index.js missing"

# Transitive: core + keystore must resolve to the same version
core_ver=$(node -e "console.log(JSON.parse(require('fs').readFileSync('node_modules/@authmesh/core/package.json','utf8')).version)")
ks_ver=$(node -e "console.log(JSON.parse(require('fs').readFileSync('node_modules/@authmesh/keystore/package.json','utf8')).version)")

assert_eq "$core_ver" "$VERSION" "@authmesh/core transitive version mismatch"
assert_eq "$ks_ver" "$VERSION" "@authmesh/keystore transitive version mismatch"

pass "npm install @authmesh/sdk@${VERSION} — SDK + core@${core_ver} + keystore@${ks_ver}"
