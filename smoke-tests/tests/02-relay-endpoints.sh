#!/usr/bin/env bash
# NAME: relay-endpoints
# CATEGORY: relay
# REQUIRES: relay
# DESCRIPTION: /ws returns 400 without upgrade, unknown paths return 404
set -euo pipefail
source "$(dirname "$0")/../lib/assert.sh"

ws_status=$(curl -sf -o /dev/null -w "%{http_code}" "${RELAY_HEALTH%/health}/ws" || true)
assert_eq "$ws_status" "400" "/ws without WS upgrade should return 400"

not_found=$(curl -sf -o /dev/null -w "%{http_code}" "${RELAY_HEALTH%/health}/nonexistent" || true)
assert_eq "$not_found" "404" "Unknown path should return 404"

pass "Relay returns 400 for non-WS /ws and 404 for unknown paths"
