import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import { SessionStore } from './session.js';
import { RateLimiter } from './rate-limit.js';

interface RelayMessage {
  type: 'listen' | 'connect' | 'data' | 'done' | 'bootstrap_watch' | 'bootstrap_init' | 'bootstrap_ack' | 'bootstrap_reject';
  otc?: string;
  payload?: string;
  jti?: string;
  [key: string]: unknown;
}

export async function createRelayServer(opts?: { host?: string; port?: number }) {
  const app = Fastify({ logger: false });
  const sessions = new SessionStore();
  const rateLimiter = new RateLimiter(5, 60_000);
  // Bootstrap watchers: jti → controller WebSocket
  const bootstrapWatchers = new Map<string, WebSocket>();

  await app.register(websocket);

  app.get('/health', async () => ({ status: 'ok', sessions: sessions.size }));

  app.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, (socket: WebSocket, req) => {
      const ip = req.ip;

      socket.on('message', (raw: Buffer) => {
        let msg: RelayMessage;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          socket.send(JSON.stringify({ type: 'error', code: 'invalid_message' }));
          return;
        }

        switch (msg.type) {
          case 'listen':
            handleListen(socket, msg, ip);
            break;
          case 'connect':
            handleConnect(socket, msg, ip);
            break;
          case 'data':
            handleData(socket, msg);
            break;
          case 'done':
            handleDone(socket);
            break;
          case 'bootstrap_watch':
            handleBootstrapWatch(socket, msg);
            break;
          case 'bootstrap_init':
            handleBootstrapInit(socket, msg);
            break;
          case 'bootstrap_ack':
          case 'bootstrap_reject':
            handleBootstrapResponse(socket, msg);
            break;
          default:
            socket.send(JSON.stringify({ type: 'error', code: 'unknown_type' }));
        }
      });

      socket.on('close', () => {
        cleanupSocket(socket);
      });
    });
  });

  function handleListen(socket: WebSocket, msg: RelayMessage, ip: string) {
    const otc = msg.otc;
    if (!otc || !/^\d{6}$/.test(otc)) {
      socket.send(JSON.stringify({ type: 'error', code: 'invalid_otc' }));
      return;
    }

    if (!rateLimiter.check(ip)) {
      socket.send(JSON.stringify({ type: 'error', code: 'rate_limited' }));
      return;
    }

    try {
      sessions.create(otc, socket);
      socket.send(JSON.stringify({ type: 'ack', message: 'session_open' }));
      // Store OTC on socket for cleanup
      (socket as WebSocket & { _otc?: string })._otc = otc;
    } catch {
      socket.send(JSON.stringify({ type: 'error', code: 'otc_in_use' }));
    }
  }

  function handleConnect(socket: WebSocket, msg: RelayMessage, ip: string) {
    const otc = msg.otc;
    if (!otc || !/^\d{6}$/.test(otc)) {
      socket.send(JSON.stringify({ type: 'error', code: 'invalid_otc' }));
      return;
    }

    if (!rateLimiter.check(ip)) {
      socket.send(JSON.stringify({ type: 'error', code: 'rate_limited' }));
      return;
    }

    const session = sessions.get(otc);
    if (!session) {
      rateLimiter.recordFailure(ip);
      socket.send(JSON.stringify({ type: 'error', code: 'otc_not_found' }));
      return;
    }

    if (session.controller) {
      socket.send(JSON.stringify({ type: 'error', code: 'peer_already_connected' }));
      return;
    }

    session.controller = socket;
    (socket as WebSocket & { _otc?: string })._otc = otc;

    // Notify both sides
    session.target.send(JSON.stringify({ type: 'peer_found' }));
    socket.send(JSON.stringify({ type: 'peer_found' }));
  }

  function handleData(socket: WebSocket, msg: RelayMessage) {
    const otc = (socket as WebSocket & { _otc?: string })._otc;
    if (!otc) return;

    const session = sessions.get(otc);
    if (!session) return;

    // Forward to the other peer (opaque blob forwarding)
    const peer = socket === session.target ? session.controller : session.target;
    if (peer && peer.readyState === 1) {
      peer.send(JSON.stringify({ type: 'data', payload: msg.payload }));
    }
  }

  function handleDone(socket: WebSocket) {
    const otc = (socket as WebSocket & { _otc?: string })._otc;
    if (!otc) return;

    const session = sessions.get(otc);
    if (!session) return;

    // Notify peer and clean up
    const peer = socket === session.target ? session.controller : session.target;
    if (peer && peer.readyState === 1) {
      peer.send(JSON.stringify({ type: 'done' }));
    }

    sessions.remove(otc);
  }

  // Bootstrap: controller registers to watch for a specific jti
  function handleBootstrapWatch(socket: WebSocket, msg: RelayMessage) {
    if (!msg.jti) { socket.send(JSON.stringify({ type: 'error', code: 'missing_jti' })); return; }
    bootstrapWatchers.set(msg.jti, socket);
    socket.send(JSON.stringify({ type: 'bootstrap_watching', jti: msg.jti }));
  }

  // Bootstrap: target initiates pairing with a token
  function handleBootstrapInit(socket: WebSocket, msg: RelayMessage) {
    if (!msg.jti) { socket.send(JSON.stringify({ type: 'error', code: 'missing_jti' })); return; }
    const watcher = bootstrapWatchers.get(msg.jti);
    if (!watcher || watcher.readyState !== 1) {
      socket.send(JSON.stringify({ type: 'bootstrap_reject', error: 'no_watcher' }));
      return;
    }
    // Store target socket for response routing
    (socket as WebSocket & { _btJti?: string })._btJti = msg.jti;
    // Forward to controller
    watcher.send(JSON.stringify(msg));
  }

  // Bootstrap: controller responds (ack or reject) — forward to target
  function handleBootstrapResponse(socket: WebSocket, msg: RelayMessage) {
    const jti = msg.jti ?? (socket as WebSocket & { _btWatchJti?: string })._btWatchJti;
    if (!jti) return;
    // Find target socket by jti
    // Simple approach: iterate connected sockets (relay is small)
    app.websocketServer?.clients.forEach((client: WebSocket) => {
      if ((client as WebSocket & { _btJti?: string })._btJti === jti && client.readyState === 1) {
        client.send(JSON.stringify(msg));
      }
    });
    // Clean up watcher
    bootstrapWatchers.delete(jti);
  }

  function cleanupSocket(socket: WebSocket) {
    const otc = (socket as WebSocket & { _otc?: string })._otc;
    if (!otc) return;

    const session = sessions.get(otc);
    if (!session) return;

    // If the disconnected socket was the only peer, clean up the session
    const peer = socket === session.target ? session.controller : session.target;
    if (peer && peer.readyState === 1) {
      peer.send(JSON.stringify({ type: 'error', code: 'peer_disconnected' }));
    }

    sessions.remove(otc);
  }

  const host = opts?.host ?? '0.0.0.0';
  const port = opts?.port ?? 3001;

  return {
    app,
    sessions,
    async start() {
      await app.listen({ host, port });
      return { host, port };
    },
    async stop() {
      sessions.destroy();
      await app.close();
    },
  };
}
