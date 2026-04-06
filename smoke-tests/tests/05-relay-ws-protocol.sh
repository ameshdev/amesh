#!/usr/bin/env bash
# NAME: relay-ws-protocol
# CATEGORY: relay
# REQUIRES: relay
# DESCRIPTION: Full WS pairing flow: listen -> connect -> peer_found, plus M3 watcher hijack protection
set -euo pipefail
source "$(dirname "$0")/../lib/assert.sh"

if ! command -v node &>/dev/null; then
  skip "node not available"
fi

WORKDIR=$(mktemp -d)
trap "rm -rf $WORKDIR" EXIT
cd "$WORKDIR"

echo '{"name":"t","version":"0.0.0","type":"module","private":true}' > package.json
npm install ws --silent 2>&1 | tail -3 || fail "npm install ws failed"

cat > test-protocol.mjs <<'SCRIPT'
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

// --- listen/connect/peer_found flow ---
const target = await open();
target.send(JSON.stringify({ type: 'listen', otc: '111222' }));
const ack = await msg(target);
if (ack.type !== 'ack') throw new Error('expected ack, got ' + ack.type);

const controller = await open();
controller.send(JSON.stringify({ type: 'connect', otc: '111222' }));
const pf1 = await msg(target);
const pf2 = await msg(controller);
if (pf1.type !== 'peer_found') throw new Error('target expected peer_found');
if (pf2.type !== 'peer_found') throw new Error('controller expected peer_found');

target.close(); controller.close();

// --- M3: watcher hijack protection ---
const jti = 'bt_smoke_' + Math.random().toString(16).slice(2);
const w1 = await open();
w1.send(JSON.stringify({ type: 'bootstrap_watch', jti }));
const wa = await msg(w1);
if (wa.type !== 'bootstrap_watching') throw new Error('expected bootstrap_watching');

const w2 = await open();
w2.send(JSON.stringify({ type: 'bootstrap_watch', jti }));
const rej = await msg(w2);
if (rej.type !== 'error' || rej.code !== 'jti_already_watched') {
  throw new Error('M3: expected jti_already_watched, got ' + JSON.stringify(rej));
}

w1.close(); w2.close();

console.log('ALL_PROTOCOL_CHECKS_PASSED');
SCRIPT

output=$(RELAY_URL="$RELAY_URL" node test-protocol.mjs 2>&1) || true
if [[ "$output" != *"ALL_PROTOCOL_CHECKS_PASSED"* ]]; then
  echo "$output" >&2
  fail "Protocol test did not pass"
fi

pass "listen/connect/peer_found + M3 watcher hijack protection"
