#!/usr/bin/env bash
# NAME: binary-download
# CATEGORY: binary
# REQUIRES: network
# DESCRIPTION: Download amesh linux binary from GitHub Releases and verify it's a valid tarball
set -euo pipefail
source "$(dirname "$0")/../lib/assert.sh"

PLATFORM="${BINARY_PLATFORM:-linux-arm64}"
URL="https://github.com/${GITHUB_REPO}/releases/download/v${VERSION}/amesh-${VERSION}-${PLATFORM}.tar.gz"

WORKDIR=$(mktemp -d)
trap "rm -rf $WORKDIR" EXIT

http_code=$(curl -sSL -o "$WORKDIR/amesh.tar.gz" -w "%{http_code}" "$URL" 2>/dev/null || true)
if [[ "$http_code" == "404" ]]; then
  skip "Binary not available for $PLATFORM (404)"
fi
assert_eq "$http_code" "200" "Download failed with HTTP $http_code"

# Verify it's a valid gzip
file_type=$(file "$WORKDIR/amesh.tar.gz" 2>/dev/null || echo "unknown")
assert_contains "$file_type" "gzip" "Downloaded file is not gzip"

# Verify tar listing contains expected binaries
tar_list=$(tar tzf "$WORKDIR/amesh.tar.gz" 2>/dev/null || true)
assert_contains "$tar_list" "amesh" "Tarball does not contain amesh binary"

pass "amesh-${VERSION}-${PLATFORM}.tar.gz downloaded ($(du -h "$WORKDIR/amesh.tar.gz" | cut -f1))"
