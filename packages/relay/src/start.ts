import { createRelayServer } from './server.js';

const port = parseInt(process.env.PORT ?? '3001', 10);
const host = process.env.HOST ?? '0.0.0.0';

const relay = await createRelayServer({ host, port });
await relay.start();

console.log(`amesh relay listening on ws://${host}:${port}/ws`);
console.log('Health check: http://' + host + ':' + port + '/health');
