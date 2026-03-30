import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import { SessionStore } from './session.js';
import { RateLimiter, OTCAttemptTracker } from './rate-limit.js';

interface RelayMessage {
  type: 'listen' | 'connect' | 'data' | 'done' | 'bootstrap_watch' | 'bootstrap_init' | 'bootstrap_ack' | 'bootstrap_reject';
  otc?: string;
  payload?: string;
  jti?: string;
  [key: string]: unknown;
}

const MAX_PAYLOAD = 65_536; // 64 KB — generous for handshake messages
const MAX_CONNECTIONS = 10_000;
const BOOTSTRAP_WATCHER_TTL_MS = 300_000; // 5 minutes

export async function createRelayServer(opts?: { host?: string; port?: number }) {
  const app = Fastify({ logger: false });
  const sessions = new SessionStore();
  const rateLimiter = new RateLimiter(5, 60_000);
  const otcAttempts = new OTCAttemptTracker(10);
  // Bootstrap watchers: jti → { socket, createdAt }
  const bootstrapWatchers = new Map<string, { socket: WebSocket; createdAt: number }>();
  let connectionCount = 0;

  await app.register(websocket, {
    options: { maxPayload: MAX_PAYLOAD },
  });

  app.get('/health', async () => ({ status: 'ok', sessions: sessions.size }));

  // Purge stale bootstrap watchers every 30 seconds
  const bootstrapCleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [jti, entry] of bootstrapWatchers) {
      if (now - entry.createdAt > BOOTSTRAP_WATCHER_TTL_MS || entry.socket.readyState !== 1) {
        bootstrapWatchers.delete(jti);
      }
    }
  }, 30_000);
  bootstrapCleanupTimer.unref();

  app.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, (socket: WebSocket, req) => {
      // Connection limit
      connectionCount++;
      if (connectionCount > MAX_CONNECTIONS) {
        socket.close(1013, 'too_many_connections');
        connectionCount--;
        return;
      }

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
        connectionCount--;
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
      // Per-OTC attempt tracking: invalidate OTC after too many failures
      if (!otcAttempts.recordAndCheck(otc)) {
        // OTC exhausted by brute-force — silently drop (already removed or expired)
      }
      socket.send(JSON.stringify({ type: 'error', code: 'otc_not_found' }));
      return;
    }

    if (session.controller) {
      socket.send(JSON.stringify({ type: 'error', code: 'peer_already_connected' }));
      return;
    }

    session.controller = socket;
    (socket as WebSocket & { _otc?: string })._otc = otc;
    // Successful connect — clean up OTC attempt tracking
    otcAttempts.remove(otc);

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
    bootstrapWatchers.set(msg.jti, { socket, createdAt: Date.now() });
    socket.send(JSON.stringify({ type: 'bootstrap_watching', jti: msg.jti }));
  }

  // Bootstrap: target initiates pairing with a token
  function handleBootstrapInit(socket: WebSocket, msg: RelayMessage) {
    if (!msg.jti) { socket.send(JSON.stringify({ type: 'error', code: 'missing_jti' })); return; }
    const entry = bootstrapWatchers.get(msg.jti);
    if (!entry || entry.socket.readyState !== 1) {
      socket.send(JSON.stringify({ type: 'bootstrap_reject', error: 'no_watcher' }));
      return;
    }
    // Store target socket for response routing
    (socket as WebSocket & { _btJti?: string })._btJti = msg.jti;
    // Whitelist forwarded fields — do not forward arbitrary attacker-controlled data
    entry.socket.send(JSON.stringify({
      type: msg.type,
      jti: msg.jti,
      token: msg.token,
      targetPubKey: msg.targetPubKey,
    }));
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
    // Clean up pairing sessions
    const otc = (socket as WebSocket & { _otc?: string })._otc;
    if (otc) {
      const session = sessions.get(otc);
      if (session) {
        const peer = socket === session.target ? session.controller : session.target;
        if (peer && peer.readyState === 1) {
          peer.send(JSON.stringify({ type: 'error', code: 'peer_disconnected' }));
        }
        sessions.remove(otc);
      }
    }

    // Clean up bootstrap watchers
    const btJti = (socket as WebSocket & { _btJti?: string })._btJti;
    if (btJti) bootstrapWatchers.delete(btJti);
    // Also check if this socket was a watcher
    for (const [jti, entry] of bootstrapWatchers) {
      if (entry.socket === socket) {
        bootstrapWatchers.delete(jti);
        break;
      }
    }
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
      clearInterval(bootstrapCleanupTimer);
      sessions.destroy();
      rateLimiter.destroy();
      otcAttempts.destroy();
      await app.close();
    },
  };
}
