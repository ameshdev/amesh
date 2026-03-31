/**
 * amesh demo — API server
 *
 * Zero secrets in this file. No API_KEY. No BEARER_TOKEN. No .env file.
 * Authentication is a cryptographic proof from a device-bound key.
 *
 * Run: npx tsx server.ts
 */

import { createServer } from 'node:http';
import { amesh } from '@authmesh/sdk';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const verify = amesh.verify();

const server = createServer(async (req, res) => {
  // Buffer body
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  (req as any).body = Buffer.concat(chunks).toString();

  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  // Public route
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', auth: 'amesh' }));
    return;
  }

  // All /api routes require amesh signature
  if (url.pathname.startsWith('/api')) {
    await new Promise<void>((resolve) => {
      verify(req as any, res, (err?: Error) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
        resolve();
      });
    });
    if (res.writableEnded) return; // middleware already sent error response

    const device = (req as any).authMesh;
    console.log(`  verified: ${device.friendlyName} (${device.deviceId})`);

    if (req.method === 'GET' && url.pathname === '/api/orders') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        authenticatedAs: { deviceId: device.deviceId, friendlyName: device.friendlyName },
        orders: [
          { id: 'ord_001', amount: 4999, item: 'Mechanical Keyboard' },
          { id: 'ord_002', amount: 1200, item: 'USB-C Hub' },
        ],
      }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/orders') {
      const body = JSON.parse((req as any).body || '{}');
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        authenticatedAs: { deviceId: device.deviceId },
        order: { id: `ord_${Math.random().toString(36).slice(2, 8)}`, ...body, status: 'pending' },
      }));
      return;
    }
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});

server.listen(PORT, 'localhost', () => {
  console.log('');
  console.log('  amesh demo — API server');
  console.log(`  http://localhost:${PORT}`);
  console.log('');
  console.log('  GET  /health      — public');
  console.log('  GET  /api/orders  — protected');
  console.log('  POST /api/orders  — protected');
  console.log('');
  console.log('  No API keys. No secrets. Waiting for requests...');
  console.log('');
});
