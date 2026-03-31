import { createRelayServer } from './server.js';

const port = parseInt(process.env.PORT ?? '3001', 10);
const host = process.env.HOST ?? '0.0.0.0';

const relay = createRelayServer({ host, port });
const addr = relay.start();

console.log(`amesh relay listening on ws://${addr.host}:${addr.port}/ws`);
console.log('Health check: http://' + addr.host + ':' + addr.port + '/health');
