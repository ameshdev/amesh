#!/usr/bin/env bash
# NAME: passphrase-migration
# CATEGORY: h2-passphrase
# REQUIRES: network
# DESCRIPTION: Legacy identity.json with embedded passphrase auto-migrates to .passphrase file on first load
set -euo pipefail
source "$(dirname "$0")/../lib/assert.sh"

PLATFORM="${BINARY_PLATFORM:-linux-arm64}"
URL="https://github.com/${GITHUB_REPO}/releases/download/v${VERSION}/amesh-${VERSION}-${PLATFORM}.tar.gz"

output=$(docker run --rm --platform "linux/${PLATFORM#linux-}" debian:12 bash -c "
  set -e
  apt-get update -qq >/dev/null 2>&1
  apt-get install -y -qq curl ca-certificates >/dev/null 2>&1
  curl -sSL '$URL' | tar xzf - -C /usr/local/bin/

  export AUTH_MESH_DIR=/tmp/amesh-h2-migrate
  mkdir -p \$AUTH_MESH_DIR

  # Step 1: normal init to create a valid key + identity
  unset AUTH_MESH_PASSPHRASE
  amesh init --name legacy-sim --backend encrypted-file >/dev/null 2>&1

  # Step 2: simulate legacy state — move passphrase BACK into identity.json
  PASS=\$(cat \$AUTH_MESH_DIR/.passphrase)
  rm \$AUTH_MESH_DIR/.passphrase

  # Inject the passphrase field using sed (no python in slim debian)
  sed -i 's|\"storageBackend\": \"encrypted-file\"|\"storageBackend\": \"encrypted-file\",\n  \"passphrase\": \"'\"\$PASS\"'\"|' \$AUTH_MESH_DIR/identity.json

  echo '---BEFORE_MIGRATION---'
  echo 'passphrase_in_identity:' \$(grep -c '\"passphrase\"' \$AUTH_MESH_DIR/identity.json || echo 0)
  echo 'passphrase_file_exists:' \$(test -f \$AUTH_MESH_DIR/.passphrase && echo yes || echo no)

  # Step 3: trigger migration by running any command that loads the context
  amesh list 2>&1

  echo '---AFTER_MIGRATION---'
  echo 'passphrase_in_identity:' \$(grep -c '\"passphrase\"' \$AUTH_MESH_DIR/identity.json || echo 0)
  echo 'passphrase_file_exists:' \$(test -f \$AUTH_MESH_DIR/.passphrase && echo yes || echo no)
  echo 'passphrase_file_mode:' \$(stat -c '%a' \$AUTH_MESH_DIR/.passphrase 2>/dev/null || echo MISSING)
" 2>&1)

# Before: passphrase in identity.json, no .passphrase file
assert_contains "$output" "passphrase_in_identity: 1" "Legacy state: passphrase should be in identity.json before migration"

# The migration log line
assert_contains "$output" "migrated legacy passphrase" "Migration warning log line should appear"

# After: passphrase removed from identity.json, .passphrase file created
after=$(echo "$output" | sed -n '/^---AFTER_MIGRATION---$/,$p')
assert_contains "$after" "passphrase_in_identity: 0" "After migration: passphrase should be gone from identity.json"
assert_contains "$after" "passphrase_file_exists: yes" "After migration: .passphrase file should exist"
assert_contains "$after" "passphrase_file_mode: 400" "After migration: .passphrase mode should be 400"

pass "H2: legacy passphrase migrated from identity.json to .passphrase (mode 400)"
