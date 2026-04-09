import { Command, Flags } from '@oclif/core';
import { loadContext } from '../context.js';
import { generateOTC, runTargetHandshake, verifySAS } from '../handshake.js';
import { generateDeviceId } from '../identity.js';
import { createInterface } from 'node:readline';

const DEFAULT_RELAY = 'wss://relay.authmesh.dev/ws';

export default class Listen extends Command {
  static override description = 'Wait for a pairing request from a controller device';

  static override flags = {
    relay: Flags.string({
      char: 'r',
      description: 'Relay server URL',
      default: DEFAULT_RELAY,
      env: 'AMESH_RELAY_URL',
    }),
    shell: Flags.boolean({
      description: 'Auto-grant shell access to the controller after pairing',
      default: false,
    }),
    files: Flags.boolean({
      description: 'Auto-grant file transfer access to the controller after pairing',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Listen);

    const { identity, keyStore, allowList, keyAlias } = await loadContext().catch(() => {
      this.error('No identity found. Run `amesh init` first.');
    });

    const otc = generateOTC();

    this.log('');
    this.log('  Connecting to relay...');
    this.log('');
    this.log('  ┌─────────────────────────────┐');
    this.log(`  │   Your pairing code: ${otc}  │`);
    this.log('  │   Expires in: 60 seconds     │');
    this.log('  └─────────────────────────────┘');
    this.log('');
    this.log('  Share this code with your Controller device.');
    this.log('');

    const signFn = async (message: Uint8Array) => {
      return keyStore.sign(keyAlias, message);
    };

    let result;
    try {
      result = await runTargetHandshake(
        flags.relay,
        otc,
        identity.publicKey,
        identity.friendlyName,
        signFn,
      );
    } catch (err) {
      this.error(`Handshake failed: ${(err as Error).message}`);
    }

    this.log('  Controller connected.');
    this.log('  Ephemeral P-256 ECDH tunnel established.');
    this.log('  Keys exchanged and verified.');
    this.log('');
    this.log('  ┌──────────────────────────────────┐');
    this.log('  │   Enter the 6-digit code shown  │');
    this.log("  │   on the Controller's screen.   │");
    this.log('  └──────────────────────────────────┘');
    this.log('');

    const entered = await this.prompt('  Verification code: ');
    if (!verifySAS(entered.trim(), result.sas)) {
      result.connection.sendConfirmation(false);
      result.connection.close();
      this.log('');
      this.log('  Code mismatch — possible MITM attack. Pairing aborted.');
      this.log('  No changes were made. Run `amesh listen` again to retry.');
      return;
    }

    result.connection.sendConfirmation(true);
    result.connection.close();

    const newDevice = {
      deviceId: generateDeviceId(result.peerPublicKey),
      publicKey: Buffer.from(result.peerPublicKey).toString('base64'),
      friendlyName: result.peerFriendlyName,
      addedAt: new Date().toISOString(),
      addedBy: 'handshake' as const,
      role: 'controller' as const,
    };

    // Enforce maxControllers limit (default: 1)
    const maxControllers =
      (identity as typeof identity & { maxControllers?: number }).maxControllers ?? 1;
    const currentControllers = await allowList.countByRole('controller');

    if (currentControllers >= maxControllers) {
      this.log(
        `  This device already has ${currentControllers} controller(s) (max: ${maxControllers}).`,
      );
      const replace = await this.confirm('  Replace existing controller(s)? (Y/n): ');
      if (!replace) {
        this.log('');
        this.log('  Pairing cancelled. No changes made.');
        return;
      }
      await allowList.replaceByRole('controller', newDevice);
    } else {
      await allowList.addDevice(newDevice);
    }

    this.log('');
    this.log(`  "${result.peerFriendlyName}" added as controller.`);

    const perms: Record<string, boolean> = {};
    if (flags.shell) perms.shell = true;
    if (flags.files) perms.files = true;
    if (Object.keys(perms).length > 0) {
      await allowList.updatePermissions(newDevice.deviceId, perms);
      if (flags.shell) this.log('  Shell access: granted');
      if (flags.files) this.log('  File transfer: granted');
    }

    this.log('');
    this.log('  Pairing complete. The relay connection is closed.');
    this.log('');
  }

  private prompt(message: string): Promise<string> {
    return new Promise((resolve) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      rl.question(message, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }

  private confirm(message: string): Promise<boolean> {
    return new Promise((resolve) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      rl.question(message, (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase() !== 'n');
      });
    });
  }
}
