#!/usr/bin/env bash
# NAME: binary-runs
# CATEGORY: binary
# REQUIRES: network
# DESCRIPTION: Extracted amesh binary: --help lists commands, --version matches release
set -euo pipefail
source "$(dirname "$0")/../lib/assert.sh"

PLATFORM="${BINARY_PLATFORM:-linux-arm64}"
HOST_ARCH=$(uname -m)

# Only run if the container arch matches the binary. On macOS arm64 host,
# Docker linux/arm64 containers can run the arm64 binary natively. x64 on
# arm64 needs QEMU and often fails.
case "$HOST_ARCH" in
  arm64|aarch64) [[ "$PLATFORM" == "linux-arm64" ]] || skip "Host arm64 cannot run $PLATFORM" ;;
  x86_64)        [[ "$PLATFORM" == "linux-x64" ]]   || skip "Host x64 cannot run $PLATFORM" ;;
esac

# The binary needs to run inside a Docker container for Linux execution.
# We'll use a quick docker run to exercise it.
URL="https://github.com/${GITHUB_REPO}/releases/download/v${VERSION}/amesh-${VERSION}-${PLATFORM}.tar.gz"

output=$(docker run --rm --platform "linux/${PLATFORM#linux-}" debian:12 bash -c "
  apt-get update -qq >/dev/null 2>&1
  apt-get install -y -qq curl ca-certificates >/dev/null 2>&1
  curl -sSL '$URL' | tar xzf - -C /usr/local/bin/
  echo VERSION_LINE=\$(amesh --version)
  echo HELP_START
  amesh --help
  echo HELP_END
" 2>&1)

version_line=$(echo "$output" | grep '^VERSION_LINE=' | cut -d= -f2-)
assert_eq "$version_line" "amesh/${VERSION}" "--version mismatch"

help_output=$(echo "$output" | sed -n '/^HELP_START$/,/^HELP_END$/p')
assert_contains "$help_output" "init" "--help should list init command"
assert_contains "$help_output" "invite" "--help should list invite command"

pass "amesh/$VERSION — --version matches, --help lists commands"
