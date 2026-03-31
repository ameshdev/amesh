import { Command, Flags } from '@oclif/core';
import { loadContext } from '../context.js';
import { generateOTC, runTargetHandshake } from '../handshake.js';
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
    this.log('  │   Expires in: 120 seconds    │');
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
    this.log(`  │   Verification code: ${result.sas}       │`);
    this.log('  │   Confirm this matches the       │');
    this.log("  │   Controller's display.          │");
    this.log('  └──────────────────────────────────┘');
    this.log('');

    const confirmed = await this.confirm('  Codes match? (Y/n): ');
    if (!confirmed) {
      this.log('');
      this.log('  Pairing cancelled. No changes made.');
      return;
    }

    await allowList.addDevice({
      deviceId: `am_${Buffer.from(result.peerPublicKey).toString('base64url').slice(0, 16)}`,
      publicKey: Buffer.from(result.peerPublicKey).toString('base64'),
      friendlyName: result.peerFriendlyName,
      addedAt: new Date().toISOString(),
      addedBy: 'handshake',
    });

    this.log('');
    this.log(`  "${result.peerFriendlyName}" added to allow list.`);
    this.log('');
    this.log('  You can now use amesh signing. The relay connection is closed.');
    this.log('');
  }

  private confirm(prompt: string): Promise<boolean> {
    return new Promise((resolve) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      rl.question(prompt, (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase() !== 'n');
      });
    });
  }
}
