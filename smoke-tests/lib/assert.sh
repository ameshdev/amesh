#!/usr/bin/env bash
# Shared assertion helpers for smoke tests.
# Exit codes: 0 = PASS, 1 = FAIL, 2 = SKIP.

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

pass() {
  echo -e "${GREEN}PASS${NC}: $1"
  exit 0
}

fail() {
  echo -e "${RED}FAIL${NC}: $1" >&2
  exit 1
}

skip() {
  echo -e "${YELLOW}SKIP${NC}: $1"
  exit 2
}

assert_eq() {
  local actual="$1" expected="$2" msg="${3:-values differ}"
  if [[ "$actual" != "$expected" ]]; then
    fail "$msg — expected '$expected', got '$actual'"
  fi
}

assert_not_empty() {
  local value="$1" msg="${2:-value is empty}"
  if [[ -z "$value" ]]; then
    fail "$msg"
  fi
}

assert_contains() {
  local haystack="$1" needle="$2" msg="${3:-substring not found}"
  if [[ "$haystack" != *"$needle"* ]]; then
    fail "$msg — '$needle' not found in output"
  fi
}

assert_file_exists() {
  local path="$1" msg="${2:-file does not exist}"
  if [[ ! -f "$path" ]]; then
    fail "$msg — $path"
  fi
}

assert_file_mode() {
  local path="$1" expected="$2" msg="${3:-wrong file mode}"
  local actual
  actual=$(stat -c '%a' "$path" 2>/dev/null || stat -f '%Lp' "$path" 2>/dev/null)
  if [[ "$actual" != "$expected" ]]; then
    fail "$msg — expected $expected, got $actual for $path"
  fi
}

assert_file_not_contains() {
  local path="$1" pattern="$2" msg="${3:-pattern found in file}"
  if grep -q "$pattern" "$path" 2>/dev/null; then
    fail "$msg — '$pattern' found in $path"
  fi
}

assert_json_field() {
  local json="$1" field="$2" expected="$3" msg="${4:-JSON field mismatch}"
  local actual
  if command -v jq &>/dev/null; then
    actual=$(echo "$json" | jq -r ".$field" 2>/dev/null)
  else
    # Fallback: grep-based extraction for simple fields
    actual=$(echo "$json" | grep -o "\"$field\":[[:space:]]*\"[^\"]*\"" | head -1 | sed 's/.*: *"\(.*\)"/\1/')
  fi
  if [[ "$actual" != "$expected" ]]; then
    fail "$msg — .$field expected '$expected', got '$actual'"
  fi
}

# Retry a command up to N times with a delay between attempts.
# Usage: retry 3 10 npm install @authmesh/core@0.5.0
retry() {
  local max_attempts="$1" delay="$2"
  shift 2
  local attempt=1
  while true; do
    if "$@"; then
      return 0
    fi
    if (( attempt >= max_attempts )); then
      return 1
    fi
    echo "  retrying in ${delay}s (attempt $attempt/$max_attempts)..."
    sleep "$delay"
    ((attempt++))
  done
}
