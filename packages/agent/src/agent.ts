import { ShellCipher } from './shell-cipher.js';
import { AllowList, createForBackend } from '@authmesh/keystore';
import type { StorageBackend } from '@authmesh/keystore';
import { loadIdentity, saveIdentity } from './identity.js';
import type { Identity } from './identity.js';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  getIdentityPath,
  getKeysDir,
  getAllowListPath,
  resolvePassphrase,
  getPidPath,
} from './paths.js';
import { runAgentShellHandshake, createMessageReader, send } from './shell-handshake.js';
import {
  FrameType,
  encodeDataFrame,
  encodeExitFrame,
  encodePongFrame,
  encodeFileAckFrame,
  encodeFileErrorFrame,
  parseFrame,
  parseResize,
  parseFileMeta,
} from './frame.js';

interface AgentOptions {
  relayUrl: string;
  allowRoot: boolean;
  idleTimeoutMinutes: number;
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

  const identity = await loadIdentity(getIdentityPath());

  // H2 — passphrase lives in a dedicated file, not identity.json.
  const { passphrase, migratedFromIdentity } = await resolvePassphrase(identity);
  if (migratedFromIdentity) {
    await saveIdentity(getIdentityPath(), identity);
  }
  const keyStore = await createForBackend(
    identity.storageBackend as StorageBackend,
    getKeysDir(),
    passphrase,
  );

  const keyAlias = identity.keyAlias ?? identity.deviceId;
  const hmacKey = await keyStore.getHmacKeyMaterial(keyAlias);
  const allowList = new AllowList(getAllowListPath(), hmacKey, identity.deviceId);

  const signFn = (message: Uint8Array) => keyStore.sign(keyAlias, message);

  /**
   * Represents an in-flight shell session. Owned by the WebSocket that opened
   * it — on WS close (M4), the owning connect() scope tears it down so the
   * bash process doesn't orphan and `sessionActive` is correctly reset.
   */
  interface ActiveSession {
    proc: {
      kill: () => void;
      exited: Promise<number>;
      terminal?: { write: (_: unknown) => void; resize: (_c: number, _r: number) => void };
    };
    cipher: ShellCipher;
    idleCheck: ReturnType<typeof setInterval>;
    messageHandler: (event: MessageEvent) => void;
  }

  let sessionActive = false;
  // Current active session, if any. Scoped to the outer closure so the
  // connect()'s ws.close handler can tear it down.
  let activeSession: ActiveSession | null = null;

  function teardownActiveSession(reason: string): void {
    if (!activeSession) return;
    console.log(`[amesh-agent] Tearing down active session (${reason})`);
    try {
      activeSession.proc.kill();
    } catch {
      /* already exited */
    }
    clearInterval(activeSession.idleCheck);
    try {
      activeSession.cipher.close();
    } catch {
      /* already closed */
    }
    activeSession = null;
    sessionActive = false;
  }

  // Write PID file for `agent stop`
  const pidPath = getPidPath();
  await mkdir(dirname(pidPath), { recursive: true });
  await writeFile(pidPath, String(process.pid), { mode: 0o600 });

  // Graceful shutdown on SIGTERM / SIGINT
  const shutdown = async () => {
    console.log('[amesh-agent] Shutting down...');
    if (activeSession) teardownActiveSession('shutdown');
    await unlink(pidPath).catch(() => {});
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

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
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

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
          .finally(() => {
            sessionActive = false;
            activeSession = null;
          });
        return;
      }
    });

    ws.addEventListener('close', () => {
      // M4 — tear down any active shell session on disconnect. Previously the
      // bash process kept running, `sessionActive` stayed true, and reconnect
      // could never accept a new session until idle timeout fired.
      if (activeSession) {
        teardownActiveSession('ws_disconnect');
      }
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
        ws,
        reader,
        id.deviceId,
        id.publicKey,
        id.friendlyName,
        sign,
        al,
      );

      // M4 — drop the handshake reader NOW. Its message listener would
      // otherwise accumulate every encrypted shell frame into an unread
      // queue for the rest of the session (unbounded memory growth).
      reader.dispose();

      const startTime = Date.now();

      console.log(
        `[amesh-agent] Shell opened by ${result.peerDeviceId} (${result.peerFriendlyName})`,
      );

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
              ws.send(
                JSON.stringify({
                  type: 'data',
                  payload: Buffer.from(encrypted).toString('base64'),
                }),
              );
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
      const messageHandler = (event: MessageEvent) => {
        const raw = typeof event.data === 'string' ? event.data : String(event.data);
        let msg;
        try {
          msg = JSON.parse(raw);
        } catch {
          return;
        }

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
              ws.send(
                JSON.stringify({ type: 'data', payload: Buffer.from(pong).toString('base64') }),
              );
              break;
            }
            case FrameType.COMMAND: {
              const cmd = new TextDecoder().decode(payload);
              console.log(
                `[amesh-agent] Command from ${result.peerDeviceId}: ${sanitizeForLog(cmd)}`,
              );
              proc.terminal?.write(cmd + '\nexit\n');
              break;
            }
            case FrameType.FILE_META: {
              // File transfer mode — handle inline
              handleFileTransfer(ws, cipher, result.peerDeviceId, payload, al);
              break;
            }
          }
        } catch (err) {
          console.error('[amesh-agent] Frame decryption error:', (err as Error).message);
        }
      };
      ws.addEventListener('message', messageHandler);

      // Register with the outer scope so the ws.close handler (M4 teardown)
      // can kill the proc, clear the timer, and close the cipher if the
      // relay disconnects mid-session.
      activeSession = {
        proc: proc as ActiveSession['proc'],
        cipher,
        idleCheck,
        messageHandler,
      };

      // Wait for process exit
      const exitCode = await proc.exited;
      clearInterval(idleCheck);
      ws.removeEventListener('message', messageHandler);

      // Send exit frame
      try {
        const exitFrame = cipher.encrypt(encodeExitFrame(exitCode));
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({ type: 'data', payload: Buffer.from(exitFrame).toString('base64') }),
          );
        }
      } catch {
        /* cipher may be closed */
      }

      const duration = Math.round((Date.now() - startTime) / 1000);
      console.log(
        `[amesh-agent] Shell closed for ${result.peerDeviceId} (exit=${exitCode}, duration=${duration}s)`,
      );

      cipher.close();
      activeSession = null;
      // sessionActive reset by .finally() in caller
    } catch (err) {
      reader.dispose();
      console.error('[amesh-agent] Shell handshake failed:', (err as Error).message);
      // sessionActive reset by .finally() in caller
    }
  }

  async function handleFileTransfer(
    ws: WebSocket,
    cipher: ShellCipher,
    peerId: string,
    metaPayload: Uint8Array,
    al: AllowList,
  ): Promise<void> {
    const meta = parseFileMeta(metaPayload);
    console.log(`[amesh-agent] File transfer from ${peerId}: ${meta.path} (${meta.size} bytes)`);

    // Check files permission
    const data = await al.read();
    const peer = data.devices.find((d) => d.deviceId === peerId);
    if (!peer?.permissions?.files) {
      console.error(`[amesh-agent] File transfer denied — no files permission for ${peerId}`);
      const errFrame = cipher.encrypt(
        encodeFileErrorFrame(
          'File transfer not permitted. Run `amesh grant <id> --files` on the target.',
        ),
      );
      ws.send(JSON.stringify({ type: 'data', payload: Buffer.from(errFrame).toString('base64') }));
      return;
    }

    // Collect chunks
    const chunks: Uint8Array[] = [];
    let received = 0;

    await new Promise<void>((resolve) => {
      const handler = (event: MessageEvent) => {
        const raw = typeof event.data === 'string' ? event.data : String(event.data);
        let msg;
        try {
          msg = JSON.parse(raw);
        } catch {
          return;
        }
        if (msg.type !== 'data' || !msg.payload) return;

        try {
          const decrypted = cipher.decrypt(Buffer.from(msg.payload, 'base64'));
          const { type, payload } = parseFrame(decrypted);

          if (type === FrameType.FILE_CHUNK) {
            chunks.push(new Uint8Array(payload));
            received += payload.length;
            if (received >= meta.size) {
              ws.removeEventListener('message', handler);
              resolve();
            }
          }
        } catch (err) {
          console.error('[amesh-agent] File chunk error:', (err as Error).message);
          ws.removeEventListener('message', handler);
          resolve();
        }
      };
      ws.addEventListener('message', handler);

      // Timeout
      setTimeout(() => {
        ws.removeEventListener('message', handler);
        resolve();
      }, 120_000);
    });

    if (received < meta.size) {
      const errFrame = cipher.encrypt(
        encodeFileErrorFrame(`Incomplete transfer: got ${received}/${meta.size} bytes`),
      );
      ws.send(JSON.stringify({ type: 'data', payload: Buffer.from(errFrame).toString('base64') }));
      return;
    }

    // Assemble and write file
    const fileData = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      fileData.set(chunk, offset);
      offset += chunk.length;
    }

    try {
      await mkdir(dirname(meta.path), { recursive: true });
      await writeFile(meta.path, fileData, { mode: meta.mode ?? 0o644 });
    } catch (err) {
      const errFrame = cipher.encrypt(
        encodeFileErrorFrame(`Write failed: ${(err as Error).message}`),
      );
      ws.send(JSON.stringify({ type: 'data', payload: Buffer.from(errFrame).toString('base64') }));
      return;
    }

    console.log(`[amesh-agent] File written: ${meta.path} (${received} bytes)`);
    const ackFrame = cipher.encrypt(encodeFileAckFrame());
    ws.send(JSON.stringify({ type: 'data', payload: Buffer.from(ackFrame).toString('base64') }));
  }

  connect();

  // Keep process alive
  await new Promise(() => {});
}
