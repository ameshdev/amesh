import { Command, Flags } from '@oclif/core';
import { loadContext } from '../context.js';
import { generateOTC, runTargetHandshake, verifySAS } from '../handshake.js';
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
      this.log('');
      this.log('  Code mismatch — possible MITM. Pairing aborted.');
      return;
    }

    const newDevice = {
      deviceId: `am_${Buffer.from(result.peerPublicKey).toString('base64url').slice(0, 16)}`,
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
    this.log('');
    this.log('  You can now use amesh signing. The relay connection is closed.');
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
