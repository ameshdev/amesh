import { ShellCipher } from './shell-cipher.js';
import { AllowList, createForBackend } from '@authmesh/keystore';
import type { StorageBackend } from '@authmesh/keystore';
import { loadIdentity } from './identity.js';
import { getIdentityPath, getKeysDir, getAllowListPath } from './paths.js';
import { runControllerShellHandshake, createMessageReader, send } from './shell-handshake.js';
import {
  FrameType,
  encodeDataFrame,
  encodeResizeFrame,
  encodePingFrame,
  encodeCommandFrame,
  parseFrame,
  parseExit,
} from './frame.js';

interface ShellOptions {
  target: string; // device ID or friendly name
  relayUrl: string;
  command?: string; // -c mode
}

export async function connectShell(opts: ShellOptions): Promise<number> {
  const identity = await loadIdentity(getIdentityPath());

  const passphrase = identity.passphrase ?? process.env.AUTH_MESH_PASSPHRASE;
  delete identity.passphrase;
  const keyStore = await createForBackend(
    identity.storageBackend as StorageBackend,
    getKeysDir(),
    passphrase,
  );

  const keyAlias = identity.keyAlias ?? identity.deviceId;
  const hmacKey = await keyStore.getHmacKeyMaterial(keyAlias);
  const allowList = new AllowList(getAllowListPath(), hmacKey, identity.deviceId);
  const signFn = (message: Uint8Array) => keyStore.sign(keyAlias, message);

  // Resolve target: by device ID or friendly name
  const data = await allowList.read();
  const targetDevice = data.devices.find(
    (d) => (d.deviceId === opts.target || d.friendlyName === opts.target) && d.role === 'target',
  );
  if (!targetDevice) {
    console.error(`Error: target "${opts.target}" not found in allow list.`);
    console.error('Run `amesh list` to see paired devices.');
    return 1;
  }

  console.error(`Connecting to ${targetDevice.friendlyName} (${targetDevice.deviceId})...`);

  // Connect to relay
  const ws = new WebSocket(opts.relayUrl);
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', (e) => reject(e));
  });

  // Request shell (C3 fix — include targetPublicKey for relay matching)
  send(ws, {
    type: 'shell',
    targetDeviceId: targetDevice.deviceId,
    targetPublicKey: targetDevice.publicKey,
  });

  const reader = createMessageReader(ws);
  const peerFound = await reader.read(30_000);
  if (peerFound.type === 'error') {
    console.error(`Relay error: ${peerFound.code}`);
    ws.close();
    return 1;
  }

  // Shell handshake
  let result;
  try {
    result = await runControllerShellHandshake(
      ws,
      reader,
      identity.deviceId,
      identity.publicKey,
      identity.friendlyName,
      signFn,
      allowList,
    );
  } catch (err) {
    console.error(`Handshake failed: ${(err as Error).message}`);
    console.error('Is the agent running on the target? Start it with: amesh agent start');
    ws.close();
    return 1;
  }

  console.error(`Connected. Shell session started.\n`);

  const cipher = new ShellCipher(result.sessionKey, 'controller');
  result.sessionKey.fill(0); // L3 fix — zero handshake result copy
  const startTime = Date.now();
  let exitCode = 0;

  return new Promise<number>((resolve) => {
    // If -c mode, send command frame
    if (opts.command) {
      const frame = cipher.encrypt(encodeCommandFrame(opts.command));
      ws.send(JSON.stringify({ type: 'data', payload: Buffer.from(frame).toString('base64') }));
    } else {
      // Interactive mode — raw terminal
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }
      process.stdin.on('data', (chunk: Buffer) => {
        const frame = cipher.encrypt(encodeDataFrame(chunk));
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'data', payload: Buffer.from(frame).toString('base64') }));
        }
      });

      // Handle terminal resize
      process.stdout.on('resize', () => {
        const frame = cipher.encrypt(
          encodeResizeFrame(process.stdout.columns, process.stdout.rows),
        );
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'data', payload: Buffer.from(frame).toString('base64') }));
        }
      });

      // Send initial resize
      if (process.stdout.columns && process.stdout.rows) {
        const frame = cipher.encrypt(
          encodeResizeFrame(process.stdout.columns, process.stdout.rows),
        );
        ws.send(JSON.stringify({ type: 'data', payload: Buffer.from(frame).toString('base64') }));
      }
    }

    // Keepalive ping
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        const frame = cipher.encrypt(encodePingFrame());
        ws.send(JSON.stringify({ type: 'data', payload: Buffer.from(frame).toString('base64') }));
      }
    }, 30_000);

    // Receive frames from agent
    ws.addEventListener('message', (event: MessageEvent) => {
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

        switch (type) {
          case FrameType.DATA:
            process.stdout.write(payload);
            break;
          case FrameType.EXIT: {
            exitCode = parseExit(payload).code;
            cleanup();
            break;
          }
          case FrameType.PONG:
            break;
        }
      } catch (err) {
        console.error(`\nFrame error: ${(err as Error).message}`);
      }
    });

    ws.addEventListener('close', () => {
      cleanup();
    });

    function cleanup() {
      clearInterval(pingInterval);
      cipher.close();
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      ws.close();
      const duration = Math.round((Date.now() - startTime) / 1000);
      console.error(`\nSession closed (exit code ${exitCode}, duration ${duration}s).`);
      resolve(exitCode);
    }
  });
}
