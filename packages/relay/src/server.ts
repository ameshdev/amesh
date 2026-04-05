import type { ServerWebSocket } from 'bun';
import { verifyMessage } from '@authmesh/core';
import { SessionStore } from './session.js';
import { RateLimiter, OTCAttemptTracker } from './rate-limit.js';
import { AgentStore } from './agent-store.js';

interface RelayMessage {
  type:
    | 'listen'
    | 'connect'
    | 'data'
    | 'done'
    | 'ping'
    | 'agent'
    | 'agent_challenge_response'
    | 'shell'
    | 'bootstrap_watch'
    | 'bootstrap_init'
    | 'bootstrap_ack'
    | 'bootstrap_reject';
  otc?: string;
  payload?: string;
  jti?: string;
  token?: string;
  targetPubKey?: string;
  deviceId?: string;
  publicKey?: string;
  timestamp?: string;
  sig?: string;
  targetDeviceId?: string;
  targetPublicKey?: string;
  [key: string]: unknown;
}

export interface WebSocketData {
  otc?: string;
  btJti?: string;
  agentDeviceId?: string;
  ip: string;
  /** Set when open() rejected the socket for exceeding MAX_CONNECTIONS. */
  rejected?: boolean;
}

/**
 * Extract the client IP address for rate limiting and logging.
 *
 * When `trustProxy` is true we take the left-most entry of X-Forwarded-For,
 * which is the originating client per RFC 7239. When false we use the TCP
 * socket peer, which is correct for direct-exposure deployments.
 *
 * This is the fix for H1: `Bun.serve().requestIP()` returns the load balancer
 * IP on Cloud Run / nginx / Cloudflare, so without XFF handling every client
 * shares the same per-IP rate-limit bucket.
 */
export function extractClientIp(
  req: Request,
  srv: { requestIP: (req: Request) => { address: string } | null },
  trustProxy: boolean,
): string {
  if (trustProxy) {
    const xff = req.headers.get('x-forwarded-for');
    if (xff) {
      const first = xff.split(',')[0]?.trim();
      if (first && isValidIp(first)) return first;
    }
  }
  return srv.requestIP(req)?.address ?? 'unknown';
}

/**
 * Validate that a string looks like an IPv4 or IPv6 address. Rejects empty
 * strings and obvious garbage so a malformed XFF header can't pollute the
 * rate-limit map with arbitrary values.
 */
export function isValidIp(s: string): boolean {
  if (!s || s.length > 64) return false; // longest IPv6 with zone id margin
  // IPv4: 1-3 digit octets separated by dots
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(s)) {
    return s.split('.').every((o) => {
      const n = Number(o);
      return n >= 0 && n <= 255;
    });
  }
  // IPv6: we only need to guarantee "no injection characters" for safe use as
  // a rate-limit map key, not full RFC 4291 conformance. Accept values that
  // contain a colon, consist of hex / colon / dot / percent / alnum (for zone
  // IDs like `fe80::1%eth0`), and contain no spaces or delimiters that could
  // confuse logs or downstream parsing.
  if (s.includes(':') && /^[0-9a-zA-Z:.%]+$/.test(s)) return true;
  return false;
}

const MAX_PAYLOAD = 65_536; // 64 KB — generous for handshake messages
const DEFAULT_MAX_CONNECTIONS = 10_000;
const BOOTSTRAP_WATCHER_TTL_MS = 300_000; // 5 minutes
// Bootstrap tokens are max 24h (see bootstrap-token.ts MAX_TTL). Consumed-jti
// entries persist for slightly longer to cover clock skew between issuer and
// relay. A relay restart loses this state — document in ops guide that
// single-use enforcement is best-effort across restarts.
const CONSUMED_JTI_TTL_MS = 25 * 60 * 60 * 1000; // 25h
// Cap on the consumed-jti map so an attacker flooding bogus bootstrap_init
// messages cannot exhaust relay memory. At 1M entries the map is ~100 MB.
const CONSUMED_JTI_MAX_SIZE = 1_000_000;

export function createRelayServer(opts?: {
  host?: string;
  port?: number;
  maxConnections?: number;
  /**
   * When true, extract the client IP from the left-most entry of the
   * `X-Forwarded-For` header instead of the TCP socket peer. Enable this when
   * the relay runs behind a trusted reverse proxy / load balancer (Cloud Run,
   * nginx, Cloudflare, …) — the socket peer there is the LB, identical for
   * every client, so per-IP rate limiting collapses into a global bucket.
   *
   * NEVER enable this when the relay is directly exposed to untrusted
   * clients: they could spoof the header and pick any rate-limit bucket.
   *
   * Defaults to reading the `AMESH_TRUST_PROXY` env var. `'1'`, `'true'`,
   * `'yes'` all enable it; anything else (including unset) disables it.
   */
  trustProxy?: boolean;
}) {
  const MAX_CONNECTIONS = opts?.maxConnections ?? DEFAULT_MAX_CONNECTIONS;
  const trustProxy =
    opts?.trustProxy ??
    (() => {
      const envVal = process.env.AMESH_TRUST_PROXY?.toLowerCase();
      return envVal === '1' || envVal === 'true' || envVal === 'yes';
    })();
  const sessions = new SessionStore();
  const agentStore = new AgentStore();
  const rateLimiter = new RateLimiter(5, 60_000);
  const shellRateLimiter = new RateLimiter(5, 60_000);
  const otcAttempts = new OTCAttemptTracker(5);
  // Bootstrap watchers: jti → { socket, createdAt }
  const bootstrapWatchers = new Map<
    string,
    { socket: ServerWebSocket<WebSocketData>; createdAt: number }
  >();
  // Consumed bootstrap-token jti → expiry timestamp (ms). Any bootstrap_init
  // for a jti in this set is rejected. This is the relay-side single-use
  // enforcement for H4 — it catches the "leaked token, attacker spawns a
  // second target" scenario even though the relay is untrusted in the wider
  // threat model (the attacker would have to also compromise the relay to
  // bypass this check, at which point the single-use guarantee was already
  // outside this layer's responsibility).
  const consumedJtis = new Map<string, number>();
  // Track all connected sockets for bootstrap response routing
  const connectedSockets = new Set<ServerWebSocket<WebSocketData>>();
  let connectionCount = 0;

  // Purge stale bootstrap watchers every 30 seconds, and prune expired
  // consumed-jti entries (H4) on the same cadence.
  const bootstrapCleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [jti, entry] of bootstrapWatchers) {
      if (
        now - entry.createdAt > BOOTSTRAP_WATCHER_TTL_MS ||
        entry.socket.readyState !== WebSocket.OPEN
      ) {
        bootstrapWatchers.delete(jti);
      }
    }
    for (const [jti, expiresAt] of consumedJtis) {
      if (expiresAt <= now) consumedJtis.delete(jti);
    }
  }, 30_000);
  bootstrapCleanupTimer.unref();

  const host = opts?.host ?? '0.0.0.0';
  const port = opts?.port ?? 3001;

  function handleListen(ws: ServerWebSocket<WebSocketData>, msg: RelayMessage) {
    const otc = msg.otc;
    if (!otc || !/^\d{6}$/.test(otc)) {
      ws.send(JSON.stringify({ type: 'error', code: 'invalid_otc' }));
      return;
    }

    if (!rateLimiter.check(ws.data.ip)) {
      ws.send(JSON.stringify({ type: 'error', code: 'rate_limited' }));
      return;
    }

    try {
      sessions.create(otc, ws);
      ws.send(JSON.stringify({ type: 'ack', message: 'session_open' }));
      ws.data.otc = otc;
    } catch {
      ws.send(JSON.stringify({ type: 'error', code: 'otc_in_use' }));
    }
  }

  function handleConnect(ws: ServerWebSocket<WebSocketData>, msg: RelayMessage) {
    const otc = msg.otc;
    if (!otc || !/^\d{6}$/.test(otc)) {
      ws.send(JSON.stringify({ type: 'error', code: 'invalid_otc' }));
      return;
    }

    if (!rateLimiter.check(ws.data.ip)) {
      ws.send(JSON.stringify({ type: 'error', code: 'rate_limited' }));
      return;
    }

    const session = sessions.get(otc);
    if (!session) {
      rateLimiter.recordFailure(ws.data.ip);
      // Per-OTC attempt tracking: invalidate OTC after too many failures
      if (!otcAttempts.recordAndCheck(otc)) {
        // OTC exhausted by brute-force — silently drop (already removed or expired)
      }
      ws.send(JSON.stringify({ type: 'error', code: 'otc_not_found' }));
      return;
    }

    if (session.controller) {
      ws.send(JSON.stringify({ type: 'error', code: 'peer_already_connected' }));
      return;
    }

    session.controller = ws;
    ws.data.otc = otc;
    // Successful connect — clean up OTC attempt tracking
    otcAttempts.remove(otc);

    // Notify both sides
    session.target.send(JSON.stringify({ type: 'peer_found' }));
    ws.send(JSON.stringify({ type: 'peer_found' }));
  }

  function handleData(ws: ServerWebSocket<WebSocketData>, msg: RelayMessage) {
    const otc = ws.data.otc;
    if (!otc) return;

    const session = sessions.get(otc);
    if (!session) return;

    // Forward to the other peer (opaque blob forwarding)
    const peer = ws === session.target ? session.controller : session.target;
    if (peer && peer.readyState === WebSocket.OPEN) {
      peer.send(JSON.stringify({ type: 'data', payload: msg.payload }));
    }
  }

  function handleDone(ws: ServerWebSocket<WebSocketData>) {
    const otc = ws.data.otc;
    if (!otc) return;

    const session = sessions.get(otc);
    if (!session) return;

    // Notify peer and clean up
    const peer = ws === session.target ? session.controller : session.target;
    if (peer && peer.readyState === WebSocket.OPEN) {
      peer.send(JSON.stringify({ type: 'done' }));
    }

    sessions.remove(otc);
  }

  // Bootstrap: controller registers to watch for a specific jti
  function handleBootstrapWatch(ws: ServerWebSocket<WebSocketData>, msg: RelayMessage) {
    if (!msg.jti) {
      ws.send(JSON.stringify({ type: 'error', code: 'missing_jti' }));
      return;
    }
    bootstrapWatchers.set(msg.jti, { socket: ws, createdAt: Date.now() });
    ws.send(JSON.stringify({ type: 'bootstrap_watching', jti: msg.jti }));
  }

  // Bootstrap: target initiates pairing with a token
  function handleBootstrapInit(ws: ServerWebSocket<WebSocketData>, msg: RelayMessage) {
    if (!msg.jti) {
      ws.send(JSON.stringify({ type: 'error', code: 'missing_jti' }));
      return;
    }

    // H4 — single-use enforcement. A jti that has already been used for a
    // bootstrap_init (successful or in-flight) is burned. This prevents a
    // leaked token from being replayed to pair a second, attacker-controlled
    // target within the token TTL.
    const now = Date.now();
    const consumedAt = consumedJtis.get(msg.jti);
    if (consumedAt !== undefined && consumedAt > now) {
      ws.send(JSON.stringify({ type: 'bootstrap_reject', error: 'token_already_used' }));
      return;
    }

    const entry = bootstrapWatchers.get(msg.jti);
    if (!entry || entry.socket.readyState !== WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'bootstrap_reject', error: 'no_watcher' }));
      return;
    }

    // Reserve the jti immediately — even if the downstream ack never arrives,
    // the token is burned. Fail-safe: a crash/disconnect mid-bootstrap should
    // not let the token be retried by a different party.
    if (consumedJtis.size >= CONSUMED_JTI_MAX_SIZE) {
      // Bound memory under adversarial flooding. Reject new bootstraps until
      // the periodic purge drops expired entries. This is a last-resort guard;
      // legitimate deployments will not hit this.
      ws.send(JSON.stringify({ type: 'bootstrap_reject', error: 'relay_overloaded' }));
      return;
    }
    consumedJtis.set(msg.jti, now + CONSUMED_JTI_TTL_MS);

    // Store target socket for response routing
    ws.data.btJti = msg.jti;
    // Whitelist forwarded fields — do not forward arbitrary attacker-controlled data
    entry.socket.send(
      JSON.stringify({
        type: msg.type,
        jti: msg.jti,
        token: msg.token,
        targetPubKey: msg.targetPubKey,
      }),
    );
  }

  // Bootstrap: controller responds (ack or reject) — forward to target
  // Whitelist forwarded fields to prevent injection of arbitrary JSON (C2 fix)
  function handleBootstrapResponse(ws: ServerWebSocket<WebSocketData>, msg: RelayMessage) {
    const jti = msg.jti;
    if (!jti) return;
    const safe = { type: msg.type, jti: msg.jti, controllerPubKey: msg.publicKey };
    // Find target socket by jti
    for (const client of connectedSockets) {
      if (client.data.btJti === jti && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(safe));
      }
    }
    // Clean up watcher
    bootstrapWatchers.delete(jti);
  }

  // Pending agent challenges: ws → { deviceId, publicKey, challenge }
  const pendingChallenges = new Map<
    ServerWebSocket<WebSocketData>,
    { deviceId: string; publicKey: string; challenge: string }
  >();

  // Shell: agent registration step 1 — issue challenge
  function handleAgent(ws: ServerWebSocket<WebSocketData>, msg: RelayMessage) {
    if (!msg.deviceId || !msg.publicKey) {
      ws.send(JSON.stringify({ type: 'error', code: 'missing_fields' }));
      return;
    }
    // Generate a random challenge nonce
    const challenge = crypto.randomUUID();
    pendingChallenges.set(ws, { deviceId: msg.deviceId, publicKey: msg.publicKey, challenge });
    ws.send(JSON.stringify({ type: 'agent_challenge', challenge }));
  }

  // Shell: agent registration step 2 — verify challenge response
  function handleAgentChallengeResponse(ws: ServerWebSocket<WebSocketData>, msg: RelayMessage) {
    const pending = pendingChallenges.get(ws);
    if (!pending) {
      ws.send(JSON.stringify({ type: 'error', code: 'no_pending_challenge' }));
      return;
    }
    pendingChallenges.delete(ws);

    if (!msg.sig) {
      ws.send(JSON.stringify({ type: 'error', code: 'missing_signature' }));
      return;
    }

    // Verify the agent signed the challenge with the claimed private key
    const publicKey = new Uint8Array(Buffer.from(pending.publicKey, 'base64'));
    const message = new TextEncoder().encode(pending.challenge);
    const signature = new Uint8Array(Buffer.from(msg.sig as string, 'base64url'));

    if (!verifyMessage(signature, message, publicKey)) {
      ws.send(JSON.stringify({ type: 'error', code: 'invalid_signature' }));
      return;
    }

    // Signature valid — agent proves it holds the private key
    const ok = agentStore.register(pending.deviceId, pending.publicKey, ws);
    if (!ok) {
      ws.send(JSON.stringify({ type: 'error', code: 'device_id_conflict' }));
      return;
    }
    ws.data.agentDeviceId = pending.deviceId;
    ws.send(JSON.stringify({ type: 'agent_registered' }));
  }

  // Shell: controller requests shell to a target agent (C3 fix — uniform responses)
  function handleShell(ws: ServerWebSocket<WebSocketData>, msg: RelayMessage) {
    if (!msg.targetDeviceId || !msg.targetPublicKey) {
      ws.send(JSON.stringify({ type: 'error', code: 'missing_fields' }));
      return;
    }
    if (!shellRateLimiter.check(ws.data.ip)) {
      ws.send(JSON.stringify({ type: 'error', code: 'rate_limited' }));
      return;
    }
    const agentWs = agentStore.matchAndGet(msg.targetDeviceId, msg.targetPublicKey);
    if (!agentWs) {
      // M6 fix — only count failures against rate limit
      shellRateLimiter.recordFailure(ws.data.ip);
      // Uniform response — don't reveal whether agent exists (C3 fix)
      ws.send(JSON.stringify({ type: 'peer_found' }));
      return;
    }
    // Create a pairing-like session for the shell (reuse existing data forwarding)
    const shellOtc = `shell_${Date.now()}_${crypto.randomUUID()}`;
    try {
      sessions.create(shellOtc, agentWs, 600); // 10 min TTL for shell sessions
      sessions.get(shellOtc)!.controller = ws;
      ws.data.otc = shellOtc;
      agentWs.data.otc = shellOtc;
      agentWs.send(JSON.stringify({ type: 'peer_found' }));
      ws.send(JSON.stringify({ type: 'peer_found' }));
    } catch {
      ws.send(JSON.stringify({ type: 'peer_found' }));
    }
  }

  // Shell: agent heartbeat
  function handlePing(ws: ServerWebSocket<WebSocketData>) {
    agentStore.recordPing(ws);
    ws.send(JSON.stringify({ type: 'pong' }));
  }

  function cleanupSocket(ws: ServerWebSocket<WebSocketData>) {
    // Clean up pending challenges
    pendingChallenges.delete(ws);

    // Clean up agent registration
    if (ws.data.agentDeviceId) {
      agentStore.removeBySocket(ws);
    }

    // Clean up pairing sessions
    const otc = ws.data.otc;
    if (otc) {
      const session = sessions.get(otc);
      if (session) {
        const peer = ws === session.target ? session.controller : session.target;
        if (peer && peer.readyState === WebSocket.OPEN) {
          peer.send(JSON.stringify({ type: 'error', code: 'peer_disconnected' }));
        }
        sessions.remove(otc);
      }
    }

    // Clean up bootstrap watchers
    const btJti = ws.data.btJti;
    if (btJti) bootstrapWatchers.delete(btJti);
    // Also check if this socket was a watcher
    for (const [jti, entry] of bootstrapWatchers) {
      if (entry.socket === ws) {
        bootstrapWatchers.delete(jti);
        break;
      }
    }
  }

  let server: ReturnType<typeof Bun.serve<WebSocketData>>;

  return {
    sessions,
    // Test-only handle on the consumed-jti map so regression tests can assert
    // single-use enforcement without needing to run a full controller flow.
    _consumedJtis: consumedJtis,
    get server() {
      return server;
    },
    start() {
      server = Bun.serve<WebSocketData>({
        hostname: host,
        port,
        fetch(req, srv) {
          const url = new URL(req.url);

          if (url.pathname === '/health') {
            return Response.json({
              status: 'ok',
              sessions: sessions.size,
              agents: agentStore.size,
            });
          }

          if (url.pathname === '/ws') {
            const ip = extractClientIp(req, srv, trustProxy);
            const upgraded = srv.upgrade(req, {
              data: { ip },
            });
            if (upgraded) return undefined;
            return new Response('WebSocket upgrade failed', { status: 400 });
          }

          return new Response('Not found', { status: 404 });
        },
        websocket: {
          maxPayloadLength: MAX_PAYLOAD,
          open(ws) {
            connectionCount++;
            connectedSockets.add(ws);
            if (connectionCount > MAX_CONNECTIONS) {
              // Mark the socket as rejected so the close handler can skip
              // cleanupSocket (which would run against a socket that never
              // completed any protocol steps) and avoid the historical
              // double-decrement bug where BOTH open() AND close() decremented
              // connectionCount, letting it drift negative and silently bypass
              // MAX_CONNECTIONS over time.
              ws.data.rejected = true;
              ws.close(1013, 'too_many_connections');
              // Do NOT decrement here — close() will handle it.
            }
          },
          message(ws, raw) {
            let msg: RelayMessage;
            try {
              msg = JSON.parse(typeof raw === 'string' ? raw : Buffer.from(raw).toString());
            } catch {
              ws.send(JSON.stringify({ type: 'error', code: 'invalid_message' }));
              return;
            }

            switch (msg.type) {
              case 'listen':
                handleListen(ws, msg);
                break;
              case 'connect':
                handleConnect(ws, msg);
                break;
              case 'data':
                handleData(ws, msg);
                break;
              case 'done':
                handleDone(ws);
                break;
              case 'bootstrap_watch':
                handleBootstrapWatch(ws, msg);
                break;
              case 'bootstrap_init':
                handleBootstrapInit(ws, msg);
                break;
              case 'bootstrap_ack':
              case 'bootstrap_reject':
                handleBootstrapResponse(ws, msg);
                break;
              case 'agent':
                handleAgent(ws, msg);
                break;
              case 'agent_challenge_response':
                handleAgentChallengeResponse(ws, msg);
                break;
              case 'shell':
                handleShell(ws, msg);
                break;
              case 'ping':
                handlePing(ws);
                break;
              default:
                ws.send(JSON.stringify({ type: 'error', code: 'unknown_type' }));
            }
          },
          close(ws) {
            connectionCount--;
            connectedSockets.delete(ws);
            // Rejected sockets never entered any protocol state, so there's
            // nothing to clean up. Running cleanupSocket on them would touch
            // empty data fields and do nothing, but skipping is cleaner and
            // makes the rejection path explicit.
            if (!ws.data.rejected) cleanupSocket(ws);
          },
        },
      });

      return { host, port: server.port };
    },
    stop() {
      clearInterval(bootstrapCleanupTimer);
      sessions.destroy();
      agentStore.destroy();
      rateLimiter.destroy();
      shellRateLimiter.destroy();
      otcAttempts.destroy();
      server?.stop();
    },
  };
}
