import { Command, Args, Flags } from '@oclif/core';
import { ShellCipher } from '../shell-cipher.js';
import { AllowList, createForBackend } from '@authmesh/keystore';
import type { StorageBackend } from '@authmesh/keystore';
import { loadIdentity, saveIdentity } from '../identity.js';
import { getIdentityPath, getKeysDir, getAllowListPath, resolvePassphrase } from '../paths.js';
import { runControllerShellHandshake, createMessageReader, send } from '../shell-handshake.js';
import { FrameType, encodeFileMetaFrame, encodeFileChunkFrame, parseFrame } from '../frame.js';
import { readFile, stat } from 'node:fs/promises';

// Relay maxPayload is 64KB. After encrypt (28B overhead) + frame header (1B)
// + base64 (×4/3) + JSON wrapper (~40B), 44KB raw fits within the limit.
const CHUNK_SIZE = 44 * 1024;

/**
 * Parse a cp argument into local path or remote path.
 * Remote format: device:path (e.g. jetson-tablet:/tmp/file.txt)
 */
function parsePath(arg: string): { device?: string; path: string } {
  const colonIdx = arg.indexOf(':');
  if (colonIdx > 0 && !arg.startsWith('/') && !arg.startsWith('.')) {
    return { device: arg.slice(0, colonIdx), path: arg.slice(colonIdx + 1) };
  }
  return { path: arg };
}

export default class Cp extends Command {
  static override description = 'Copy a file to or from a paired device';

  static override args = {
    source: Args.string({
      description: 'Source path (local path or device:/remote/path)',
      required: true,
    }),
    destination: Args.string({
      description: 'Destination path (local path or device:/remote/path)',
      required: true,
    }),
  };

  static override flags = {
    relay: Flags.string({
      char: 'r',
      description: 'Relay server URL',
      default: 'wss://relay.authmesh.dev/ws',
      env: 'AMESH_RELAY_URL',
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Cp);

    const src = parsePath(args.source);
    const dst = parsePath(args.destination);

    // Exactly one side must be remote
    if (src.device && dst.device) {
      this.error('Cannot copy between two remote devices. One side must be local.');
    }
    if (!src.device && !dst.device) {
      this.error('One side must be a remote device (e.g. device-name:/path/to/file).');
    }

    // For now, only support push (local → remote)
    if (src.device) {
      this.error(
        'Pull (remote → local) is not yet supported. Use push: amesh cp local-file device:/path',
      );
    }

    const targetName = dst.device!;
    const localPath = src.path;
    const remotePath = dst.path;

    // Read local file
    let fileData: Uint8Array;
    let fileMode: number;
    try {
      const st = await stat(localPath);
      fileMode = st.mode;
      fileData = new Uint8Array(await readFile(localPath));
    } catch (err) {
      this.error(`Cannot read source file: ${(err as Error).message}`);
    }

    // Load identity and connect
    const identity = await loadIdentity(getIdentityPath());
    const { passphrase, migratedFromIdentity } = await resolvePassphrase(identity);
    if (migratedFromIdentity) await saveIdentity(getIdentityPath(), identity);

    const keyStore = await createForBackend(
      identity.storageBackend as StorageBackend,
      getKeysDir(),
      passphrase,
    );
    const keyAlias = identity.keyAlias ?? identity.deviceId;
    const hmacKey = await keyStore.getHmacKeyMaterial(keyAlias);
    const allowList = new AllowList(getAllowListPath(), hmacKey, identity.deviceId);
    const signFn = (message: Uint8Array) => keyStore.sign(keyAlias, message);

    // Resolve target
    const data = await allowList.read();
    const targetDevice = data.devices.find(
      (d) => (d.deviceId === targetName || d.friendlyName === targetName) && d.role === 'target',
    );
    if (!targetDevice) {
      this.error(
        `Target "${targetName}" not found in allow list. Run \`amesh list\` to see paired devices.`,
      );
    }

    this.log(`  Copying ${localPath} → ${targetDevice.friendlyName}:${remotePath}`);
    this.log(`  Size: ${fileData.length} bytes`);

    // Connect to relay
    const ws = new WebSocket(flags.relay);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve());
      ws.addEventListener('error', (e) => reject(e));
    });

    // Request file transfer session (reuses shell session routing)
    send(ws, {
      type: 'shell',
      targetDeviceId: targetDevice.deviceId,
      targetPublicKey: targetDevice.publicKey,
    });

    const reader = createMessageReader(ws);
    const peerFound = await reader.read(30_000);
    if (peerFound.type === 'error') {
      this.error(`Relay error: ${peerFound.code}`);
    }

    // Shell handshake (same crypto tunnel, different payload)
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
      this.error(`Handshake failed: ${(err as Error).message}`);
    }

    reader.dispose();

    const cipher = new ShellCipher(result.sessionKey, 'controller');
    result.sessionKey.fill(0);

    // Send file metadata
    const metaFrame = cipher.encrypt(
      encodeFileMetaFrame({ path: remotePath, size: fileData.length, mode: fileMode }),
    );
    ws.send(JSON.stringify({ type: 'data', payload: Buffer.from(metaFrame).toString('base64') }));

    // Send file in chunks
    let offset = 0;
    while (offset < fileData.length) {
      const end = Math.min(offset + CHUNK_SIZE, fileData.length);
      const chunk = fileData.subarray(offset, end);
      const chunkFrame = cipher.encrypt(encodeFileChunkFrame(chunk));
      ws.send(
        JSON.stringify({ type: 'data', payload: Buffer.from(chunkFrame).toString('base64') }),
      );
      offset = end;
    }

    // Wait for ACK or ERROR from agent
    const ackPromise = new Promise<boolean>((resolve) => {
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
          if (type === FrameType.FILE_ACK) {
            ws.removeEventListener('message', handler);
            resolve(true);
          } else if (type === FrameType.FILE_ERROR) {
            const errorMsg = new TextDecoder().decode(payload);
            console.error(`  Error from target: ${errorMsg}`);
            ws.removeEventListener('message', handler);
            resolve(false);
          }
        } catch {
          // decrypt error — ignore
        }
      };
      ws.addEventListener('message', handler);

      // Timeout
      setTimeout(() => {
        ws.removeEventListener('message', handler);
        resolve(false);
      }, 30_000);
    });

    const ok = await ackPromise;
    cipher.close();
    ws.close();

    if (ok) {
      this.log('  Transfer complete.');
    } else {
      this.error('File transfer failed.');
    }
  }
}
