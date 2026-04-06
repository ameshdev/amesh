#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# amesh smoke-test runner
#
# Usage:
#   ./smoke-tests/run.sh <version>            # run all tests
#   ./smoke-tests/run.sh <version> --test 07  # run one test
#   ./smoke-tests/run.sh <version> --dry-run  # list tests only
#
# Exit code: 0 if all pass/skip, 1 if any fail.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
NETWORK="amesh-smoke-net"
RELAY_CONTAINER="amesh-smoke-relay"
RELAY_IMAGE="amesh-relay-smoke"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
NC='\033[0m'

# ── Parse args ──────────────────────────────────────────────
VERSION="${1:-}"
SINGLE_TEST=""
DRY_RUN=false
shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --test)  SINGLE_TEST="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version> [--test <number>] [--dry-run]"
  exit 1
fi

echo -e "${BOLD}amesh smoke tests — v${VERSION}${NC}"
echo ""

# ── Discover tests ──────────────────────────────────────────
tests=()
for f in "$SCRIPT_DIR"/tests/*.sh; do
  [[ -f "$f" ]] || continue
  num=$(basename "$f" | grep -o '^[0-9]*')
  if [[ -n "$SINGLE_TEST" && "$num" != "$SINGLE_TEST" ]]; then
    continue
  fi
  tests+=("$f")
done

if [[ ${#tests[@]} -eq 0 ]]; then
  echo "No tests found."
  exit 1
fi

if $DRY_RUN; then
  echo "Tests that would run:"
  for t in "${tests[@]}"; do
    name=$(basename "$t" .sh | sed 's/^[0-9]*-//')
    echo "  $(basename "$t" .sh) — $name"
  done
  exit 0
fi

# ── Helpers ─────────────────────────────────────────────────
needs_relay() {
  local test_file="$1"
  head -10 "$test_file" | grep -qi 'REQUIRES:.*relay'
}

start_relay() {
  echo -e "  ${BOLD}starting relay container...${NC}"
  docker network create "$NETWORK" 2>/dev/null || true

  # Build the relay from the repo's Dockerfile.relay
  docker build -f "$REPO_ROOT/Dockerfile.relay" -t "$RELAY_IMAGE" "$REPO_ROOT" \
    -q >/dev/null 2>&1

  docker rm -f "$RELAY_CONTAINER" 2>/dev/null || true
  docker run -d --name "$RELAY_CONTAINER" \
    --network "$NETWORK" \
    -p 3001:3001 \
    -e PORT=3001 \
    -e AMESH_TRUST_PROXY=1 \
    "$RELAY_IMAGE" >/dev/null

  # Wait for /health via localhost (port-forwarded above with -p 3001:3001).
  # Cannot use `docker exec curl` — the relay image may not have curl.
  local attempts=0
  while ! curl -sf http://localhost:3001/health >/dev/null 2>&1; do
    ((attempts++))
    if (( attempts > 20 )); then
      echo -e "  ${RED}relay did not become healthy in 10s${NC}"
      docker logs "$RELAY_CONTAINER" 2>&1 | tail -10
      return 1
    fi
    sleep 0.5
  done
  echo "  relay healthy."
}

stop_relay() {
  docker rm -f "$RELAY_CONTAINER" 2>/dev/null || true
  docker network rm "$NETWORK" 2>/dev/null || true
}

cleanup() {
  stop_relay 2>/dev/null || true
}
trap cleanup EXIT

# ── Detect host arch for binary test targeting ──────────────
HOST_ARCH=$(uname -m)
case "$HOST_ARCH" in
  arm64|aarch64) BINARY_PLATFORM="linux-arm64" ;;
  x86_64)        BINARY_PLATFORM="linux-x64" ;;
  *)             BINARY_PLATFORM="linux-x64" ;;
esac

# ── Run tests ───────────────────────────────────────────────
relay_started=false
results=()  # "name:status:time"

for test_file in "${tests[@]}"; do
  test_basename=$(basename "$test_file" .sh)
  test_name=$(echo "$test_basename" | sed 's/^[0-9]*-//')

  # Start relay if needed and not yet running
  if needs_relay "$test_file" && ! $relay_started; then
    start_relay
    relay_started=true
  fi

  printf "  %-38s" "$test_basename"
  start_time=$(date +%s)

  # Run the test — in Docker if it needs the relay network, else on the host
  # For simplicity on macOS (where the Docker tests will also exercise linux),
  # we run all tests as bash scripts on the host. Tests that need the relay
  # connect via localhost (we port-forward).
  #
  # If the relay is running, expose it on localhost too:
  if $relay_started; then
    # Ensure port forwarding is set up
    docker inspect "$RELAY_CONTAINER" >/dev/null 2>&1 || true
  fi

  set +e
  output=$(
    VERSION="$VERSION" \
    RELAY_URL="ws://localhost:3001/ws" \
    RELAY_HEALTH="http://localhost:3001/health" \
    BINARY_PLATFORM="$BINARY_PLATFORM" \
    GITHUB_REPO="ameshdev/amesh" \
    bash "$test_file" 2>&1
  )
  exit_code=$?
  set -e

  end_time=$(date +%s)
  elapsed=$((end_time - start_time))

  case $exit_code in
    0) status="${GREEN}PASS${NC}"; status_raw="PASS" ;;
    2) status="${YELLOW}SKIP${NC}"; status_raw="SKIP" ;;
    *) status="${RED}FAIL${NC}"; status_raw="FAIL" ;;
  esac

  echo -e "$status  ${elapsed}s"
  results+=("$test_name:$status_raw:${elapsed}s")

  if [[ $exit_code -eq 1 ]]; then
    echo "$output" | sed 's/^/    /'
    echo ""
  fi
done

# Port-forward the relay container to localhost if needed for the current tests.
# We need to do this once after starting the relay.
# Actually let's add -p 3001:3001 to the docker run above instead.
# Patching the relay start to include port forwarding.

# ── Summary ─────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Summary${NC}"
echo "────────────────────────────────────────────────"

pass_count=0
fail_count=0
skip_count=0

for r in "${results[@]}"; do
  IFS=':' read -r name status time <<< "$r"
  case $status in
    PASS) ((pass_count++)) ;;
    FAIL) ((fail_count++)) ;;
    SKIP) ((skip_count++)) ;;
  esac
done

echo -e "  ${GREEN}${pass_count} passed${NC}, ${RED}${fail_count} failed${NC}, ${YELLOW}${skip_count} skipped${NC}"
echo ""

if (( fail_count > 0 )); then
  exit 1
fi
exit 0
