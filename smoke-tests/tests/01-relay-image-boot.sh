#!/usr/bin/env bash
# NAME: relay-image-boot
# CATEGORY: relay
# REQUIRES: relay
# DESCRIPTION: Relay Docker image starts and /health returns {status: "ok"}
set -euo pipefail
source "$(dirname "$0")/../lib/assert.sh"

response=$(curl -sf "$RELAY_HEALTH" || true)
assert_not_empty "$response" "Health endpoint returned empty"
assert_contains "$response" '"status":"ok"' "Health should contain status:ok"
assert_contains "$response" '"sessions"' "Health should contain sessions field"
assert_contains "$response" '"agents"' "Health should contain agents field"

pass "Relay /health returns {status:'ok', sessions, agents}"
