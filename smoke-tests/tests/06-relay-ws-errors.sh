#!/usr/bin/env bash
# NAME: relay-ws-errors
# CATEGORY: relay
# REQUIRES: relay
# DESCRIPTION: WebSocket error responses: invalid OTC, unknown type
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
npm install ws --silent >/dev/null 2>&1

cat > test-errors.mjs <<'SCRIPT'
import { WebSocket } from 'ws';
const RELAY = process.env.RELAY_URL;

function open() {
  return new Promise((res, rej) => {
    const ws = new WebSocket(RELAY);
    ws.once('open', () => res(ws));
    ws.once('error', rej);
  });
}
function msg(ws, ms = 3000) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout')), ms);
    ws.once('message', d => { clearTimeout(t); res(JSON.parse(d.toString())); });
  });
}

// Connect to nonexistent OTC
const ws1 = await open();
ws1.send(JSON.stringify({ type: 'connect', otc: '999999' }));
const r1 = await msg(ws1);
if (r1.code !== 'otc_not_found') throw new Error('expected otc_not_found, got ' + r1.code);
ws1.close();

// Unknown message type
const ws2 = await open();
ws2.send(JSON.stringify({ type: 'totally_bogus' }));
const r2 = await msg(ws2);
if (r2.code !== 'unknown_type') throw new Error('expected unknown_type, got ' + r2.code);
ws2.close();

// Invalid OTC format
const ws3 = await open();
ws3.send(JSON.stringify({ type: 'listen', otc: 'abc' }));
const r3 = await msg(ws3);
if (r3.code !== 'invalid_otc') throw new Error('expected invalid_otc, got ' + r3.code);
ws3.close();

console.log('ALL_ERROR_CHECKS_PASSED');
SCRIPT

output=$(RELAY_URL="$RELAY_URL" node test-errors.mjs 2>&1)
assert_contains "$output" "ALL_ERROR_CHECKS_PASSED" "Error test did not pass"

pass "Relay error responses: otc_not_found, unknown_type, invalid_otc"
