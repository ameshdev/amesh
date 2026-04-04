#!/usr/bin/env bun

// The relay server requires Bun for Bun.serve() WebSocket support.
if (typeof globalThis.Bun === 'undefined') {
  console.error('Error: The amesh relay requires Bun runtime (Bun.serve WebSocket API).');
  console.error('  Install Bun: curl -fsSL https://bun.sh/install | bash');
  console.error('  Then run: bun amesh-relay');
  process.exit(1);
}

import { createRelayServer } from './server.js';

const port = parseInt(process.env.PORT ?? '3001', 10);
const host = process.env.HOST ?? '0.0.0.0';

const relay = createRelayServer({ host, port });
const addr = relay.start();

console.log(`amesh relay listening on ws://${addr.host}:${addr.port}/ws`);
console.log('Health check: http://' + addr.host + ':' + addr.port + '/health');
