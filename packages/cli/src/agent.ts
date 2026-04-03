import { ShellCipher } from './shell-cipher.js';
import { AllowList, createForBackend } from '@authmesh/keystore';
import type { StorageBackend } from '@authmesh/keystore';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { runAgentShellHandshake, createMessageReader, send } from './shell-handshake.js';
import {
  FrameType,
  encodeDataFrame,
  encodeExitFrame,
  encodePongFrame,
  parseFrame,
  parseResize,
} from './frame.js';

interface AgentOptions {
  relayUrl: string;
  allowRoot: boolean;
  idleTimeoutMinutes: number;
}

interface Identity {
  deviceId: string;
  keyAlias?: string;
  publicKey: string;
  friendlyName: string;
  storageBackend: string;
}

function getAmeshDir(): string {
  return process.env.AUTH_MESH_DIR ?? join(homedir(), '.amesh');
}

function sanitizeForLog(str: string, maxLen = 200): string {
  // Strip non-printable characters and truncate
  return str.replace(/[^\x20-\x7E]/g, '').slice(0, maxLen);
}

export async function startAgent(opts: AgentOptions): Promise<void> {
  // Root guard (M1 fix)
  if (typeof process.getuid === 'function' && process.getuid() === 0 && !opts.allowRoot) {
    console.error('[amesh-agent] ERROR: refusing to run as root.');
    console.error('  Running as root grants root shells to all authorized controllers.');
    console.error('  Use --allow-root to override.');
    process.exit(1);
  }

  const ameshDir = getAmeshDir();
  const identityContent = await readFile(join(ameshDir, 'identity.json'), 'utf-8');
  const identity = JSON.parse(identityContent) as Identity;

  const keyStore = await createForBackend(
    identity.storageBackend as StorageBackend,
    join(ameshDir, 'keys'),
    process.env.AUTH_MESH_PASSPHRASE,
  );

  const keyAlias = identity.keyAlias ?? identity.deviceId;
  const hmacKey = await keyStore.getHmacKeyMaterial(keyAlias);
  const allowList = new AllowList(join(ameshDir, 'allow_list.json'), hmacKey, identity.deviceId);

  const signFn = (message: Uint8Array) => keyStore.sign(keyAlias, message);

  let sessionActive = false;

  console.log(`[amesh-agent] Device: ${identity.deviceId} (${identity.friendlyName})`);
  console.log(`[amesh-agent] Connecting to relay: ${opts.relayUrl}`);

  // Connect to relay with reconnect
  let reconnectDelay = 1000;
  const maxReconnectDelay = 30000;

  function connect(): void {
    const ws = new WebSocket(opts.relayUrl);

    ws.addEventListener('open', () => {
      reconnectDelay = 1000;
      // Step 1: Send registration request — relay will issue a challenge
      send(ws, {
        type: 'agent',
        deviceId: identity.deviceId,
        publicKey: identity.publicKey,
      });

      // Heartbeat
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          send(ws, { type: 'ping' });
        }
      }, 30_000);

      ws.addEventListener('close', () => {
        clearInterval(pingInterval);
      });
    });

    ws.addEventListener('message', async (event: MessageEvent) => {
      const raw = typeof event.data === 'string' ? event.data : String(event.data);
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      // Step 2: Relay issues challenge — sign it to prove key ownership
      if (msg.type === 'agent_challenge') {
        const challenge = new TextEncoder().encode(msg.challenge as string);
        const sig = await signFn(challenge);
        send(ws, {
          type: 'agent_challenge_response',
          sig: Buffer.from(sig).toString('base64url'),
        });
        return;
      }

      if (msg.type === 'agent_registered') {
        console.log('[amesh-agent] Registered with relay (identity verified).');
        const data = await allowList.read();
        const shellControllers = data.devices.filter(
          (d) => d.role === 'controller' && d.permissions?.shell,
        ).length;
        console.log(`[amesh-agent] Authorized controllers with shell access: ${shellControllers}`);
        return;
      }

      if (msg.type === 'pong') return;

      if (msg.type === 'peer_found') {
        if (sessionActive) {
          console.error('[amesh-agent] Session already active, rejecting');
          return;
        }
        sessionActive = true;
        handleShellRequest(ws, allowList, identity, signFn, opts.idleTimeoutMinutes)
          .catch(() => {})
          .finally(() => { sessionActive = false; });
        return;
      }
    });

    ws.addEventListener('close', () => {
      console.log(`[amesh-agent] Disconnected. Reconnecting in ${reconnectDelay / 1000}s...`);
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, maxReconnectDelay);
    });

    ws.addEventListener('error', () => {
      // close event will fire after error, triggering reconnect
    });
  }

  async function handleShellRequest(
    ws: WebSocket,
    al: AllowList,
    id: Identity,
    sign: (message: Uint8Array) => Promise<Uint8Array>,
    idleTimeoutMin: number,
  ): Promise<void> {
    const reader = createMessageReader(ws);

    try {
      const result = await runAgentShellHandshake(
        ws, reader,
        id.deviceId, id.publicKey, id.friendlyName,
        sign, al,
      );

      const startTime = Date.now();

      console.log(`[amesh-agent] Shell opened by ${result.peerDeviceId} (${result.peerFriendlyName})`);

      // Set up encrypted cipher + zero the handshake result copy (L3 fix)
      const cipher = new ShellCipher(result.sessionKey, 'target');
      result.sessionKey.fill(0);

      // Spawn PTY
      const cols = process.stdout.columns ?? 80;
      const rows = process.stdout.rows ?? 24;

      const proc = Bun.spawn(['bash'], {
        terminal: {
          cols,
          rows,
          data(_terminal: unknown, data: Uint8Array) {
            // PTY stdout → encrypt → send
            const frame = encodeDataFrame(data);
            const encrypted = cipher.encrypt(frame);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'data', payload: Buffer.from(encrypted).toString('base64') }));
            }
          },
        },
      });

      // Idle timeout (H1 fix)
      let lastActivity = Date.now();
      const idleCheck = setInterval(() => {
        if (Date.now() - lastActivity > idleTimeoutMin * 60_000) {
          console.log(`[amesh-agent] Idle timeout for ${result.peerDeviceId}`);
          proc.kill();
        }
      }, 30_000);

      // Receive encrypted frames from controller
      ws.addEventListener('message', (event: MessageEvent) => {
        const raw = typeof event.data === 'string' ? event.data : String(event.data);
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }

        if (msg.type !== 'data' || !msg.payload) return;
        lastActivity = Date.now();

        try {
          const decrypted = cipher.decrypt(Buffer.from(msg.payload, 'base64'));
          const { type, payload } = parseFrame(decrypted);

          switch (type) {
            case FrameType.DATA:
              proc.terminal?.write(payload);
              break;
            case FrameType.RESIZE: {
              const { cols: c, rows: r } = parseResize(payload);
              proc.terminal?.resize(c, r);
              break;
            }
            case FrameType.PING: {
              const pong = cipher.encrypt(encodePongFrame());
              ws.send(JSON.stringify({ type: 'data', payload: Buffer.from(pong).toString('base64') }));
              break;
            }
            case FrameType.COMMAND: {
              const cmd = new TextDecoder().decode(payload);
              console.log(`[amesh-agent] Command from ${result.peerDeviceId}: ${sanitizeForLog(cmd)}`);
              proc.terminal?.write(cmd + '\nexit\n');
              break;
            }
          }
        } catch (err) {
          console.error('[amesh-agent] Frame decryption error:', (err as Error).message);
        }
      });

      // Wait for process exit
      const exitCode = await proc.exited;
      clearInterval(idleCheck);

      // Send exit frame
      try {
        const exitFrame = cipher.encrypt(encodeExitFrame(exitCode));
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'data', payload: Buffer.from(exitFrame).toString('base64') }));
        }
      } catch { /* cipher may be closed */ }

      const duration = Math.round((Date.now() - startTime) / 1000);
      console.log(`[amesh-agent] Shell closed for ${result.peerDeviceId} (exit=${exitCode}, duration=${duration}s)`);

      cipher.close();
      // sessionActive reset by .finally() in caller

    } catch (err) {
      console.error('[amesh-agent] Shell handshake failed:', (err as Error).message);
      // sessionActive reset by .finally() in caller
    }
  }

  connect();

  // Keep process alive
  await new Promise(() => {});
}
