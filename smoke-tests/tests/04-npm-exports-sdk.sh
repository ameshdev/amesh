#!/usr/bin/env bash
# NAME: npm-exports-sdk
# CATEGORY: npm
# REQUIRES: network
# DESCRIPTION: Import @authmesh/sdk top-level + /middleware subpath, verify expected exports
set -euo pipefail
source "$(dirname "$0")/../lib/assert.sh"

if ! command -v node &>/dev/null; then
  skip "node not available"
fi

WORKDIR=$(mktemp -d)
trap "rm -rf $WORKDIR" EXIT
cd "$WORKDIR"

npm init -y --silent >/dev/null 2>&1
echo '{"type":"module"}' > package.json
retry 3 10 npm install "@authmesh/sdk@${VERSION}" --silent >/dev/null 2>&1

# Top-level exports
output=$(node --input-type=module -e '
import * as m from "@authmesh/sdk";
const keys = Object.keys(m).sort().join(",");
console.log(keys);
')
assert_contains "$output" "AuthMeshClient" "Missing AuthMeshClient export"
assert_contains "$output" "authMeshVerify" "Missing authMeshVerify export"
assert_contains "$output" "buildAuthHeader" "Missing buildAuthHeader export"
assert_contains "$output" "parseAuthHeader" "Missing parseAuthHeader export"

# Middleware subpath
mw_output=$(node --input-type=module -e '
import * as m from "@authmesh/sdk/middleware";
console.log(Object.keys(m).sort().join(","));
')
assert_contains "$mw_output" "authMeshVerify" "Middleware subpath missing authMeshVerify"

pass "SDK exports: $output | middleware: $mw_output"
