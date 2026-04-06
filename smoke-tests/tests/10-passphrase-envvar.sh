#!/usr/bin/env bash
# NAME: passphrase-envvar
# CATEGORY: h2-passphrase
# REQUIRES: network
# DESCRIPTION: AUTH_MESH_PASSPHRASE env var is honoured; identity.json contains no passphrase field
set -euo pipefail
source "$(dirname "$0")/../lib/assert.sh"

PLATFORM="${BINARY_PLATFORM:-linux-arm64}"
URL="https://github.com/${GITHUB_REPO}/releases/download/v${VERSION}/amesh-${VERSION}-${PLATFORM}.tar.gz"

output=$(docker run --rm --platform "linux/${PLATFORM#linux-}" debian:12 bash -c "
  apt-get update -qq >/dev/null 2>&1
  apt-get install -y -qq curl ca-certificates >/dev/null 2>&1
  curl -sSL '$URL' | tar xzf - -C /usr/local/bin/
  export AUTH_MESH_DIR=/tmp/amesh-h2-env
  export AUTH_MESH_PASSPHRASE='operator-supplied-never-on-disk'
  mkdir -p \$AUTH_MESH_DIR
  amesh init --name smoke-envvar --backend encrypted-file 2>&1
  echo '---HAS_PASSPHRASE_IN_IDENTITY---'
  grep -c '\"passphrase\"' \$AUTH_MESH_DIR/identity.json || true
" 2>&1)

has_pass=$(echo "$output" | sed -n '/^---HAS_PASSPHRASE_IN_IDENTITY---$/,${/^---/!p;}' | tr -d '[:space:]')
assert_eq "$has_pass" "0" "identity.json must not contain passphrase when AUTH_MESH_PASSPHRASE is set"

pass "H2: AUTH_MESH_PASSPHRASE env var honoured, no passphrase in identity.json"
