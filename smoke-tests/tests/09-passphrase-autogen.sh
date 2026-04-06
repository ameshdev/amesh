#!/usr/bin/env bash
# NAME: passphrase-autogen
# CATEGORY: h2-passphrase
# REQUIRES: network
# DESCRIPTION: amesh init --backend encrypted-file auto-generates passphrase in .passphrase file (not identity.json)
set -euo pipefail
source "$(dirname "$0")/../lib/assert.sh"

PLATFORM="${BINARY_PLATFORM:-linux-arm64}"
URL="https://github.com/${GITHUB_REPO}/releases/download/v${VERSION}/amesh-${VERSION}-${PLATFORM}.tar.gz"

output=$(docker run --rm --platform "linux/${PLATFORM#linux-}" debian:12 bash -c "
  apt-get update -qq >/dev/null 2>&1
  apt-get install -y -qq curl ca-certificates >/dev/null 2>&1
  curl -sSL '$URL' | tar xzf - -C /usr/local/bin/
  export AUTH_MESH_DIR=/tmp/amesh-h2
  mkdir -p \$AUTH_MESH_DIR
  unset AUTH_MESH_PASSPHRASE
  amesh init --name smoke-autogen --backend encrypted-file 2>&1
  echo '---FILES---'
  ls -la \$AUTH_MESH_DIR/
  echo '---IDENTITY---'
  cat \$AUTH_MESH_DIR/identity.json
  echo ''
  echo '---PASSFILE_MODE---'
  stat -c '%a' \$AUTH_MESH_DIR/.passphrase 2>/dev/null || echo 'MISSING'
  echo '---HAS_PASSPHRASE_IN_IDENTITY---'
  grep -c '\"passphrase\"' \$AUTH_MESH_DIR/identity.json || true
" 2>&1)

# .passphrase file must exist with mode 400
mode=$(echo "$output" | sed -n '/^---PASSFILE_MODE---$/,/^---/{/^---/!p;}' | tr -d '[:space:]')
assert_eq "$mode" "400" ".passphrase file mode should be 400"

# identity.json must NOT contain passphrase field
has_pass=$(echo "$output" | sed -n '/^---HAS_PASSPHRASE_IN_IDENTITY---$/,/^---/{/^---/!p;}' | tr -d '[:space:]')
assert_eq "$has_pass" "0" "identity.json must not contain passphrase field"

pass "H2: auto-generated passphrase in .passphrase (mode 400), not in identity.json"
