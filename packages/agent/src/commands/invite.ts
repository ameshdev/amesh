import { Command, Args, Flags } from '@oclif/core';
import { loadContext } from '../context.js';
import { runControllerHandshake } from '../handshake.js';
import { generateDeviceId } from '../identity.js';
const DEFAULT_RELAY = 'wss://relay.authmesh.dev/ws';

export default class Invite extends Command {
  static override description = 'Pair with a target device using its pairing code';

  static override args = {
    code: Args.string({
      description: '6-digit pairing code from the target device',
      required: true,
    }),
  };

  static override flags = {
    relay: Flags.string({
      char: 'r',
      description: 'Relay server URL',
      default: DEFAULT_RELAY,
      env: 'AMESH_RELAY_URL',
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Invite);

    if (!/^\d{6}$/.test(args.code)) {
      this.error('Pairing code must be exactly 6 digits.');
    }

    const { identity, keyStore, allowList, keyAlias } = await loadContext().catch(() => {
      this.error('No identity found. Run `amesh init` first.');
    });

    this.log('');
    this.log(`  Connecting to relay with code ${args.code}...`);

    const signFn = async (message: Uint8Array) => {
      return keyStore.sign(keyAlias, message);
    };

    let result;
    try {
      result = await runControllerHandshake(
        flags.relay,
        args.code,
        identity.publicKey,
        identity.friendlyName,
        signFn,
      );
    } catch (err) {
      this.error(`Handshake failed: ${(err as Error).message}`);
    }

    this.log('  Peer found.');
    this.log('  Ephemeral P-256 ECDH tunnel established.');
    this.log('  Keys exchanged and verified.');
    this.log('');
    this.log('  ┌──────────────────────────────────┐');
    this.log(`  │   Verification code: ${result.sas}       │`);
    this.log('  │   Enter this code on the Target  │');
    this.log('  │   device to complete pairing.    │');
    this.log('  └──────────────────────────────────┘');
    this.log('');

    await allowList.addDevice({
      deviceId: generateDeviceId(result.peerPublicKey),
      publicKey: Buffer.from(result.peerPublicKey).toString('base64'),
      friendlyName: result.peerFriendlyName,
      addedAt: new Date().toISOString(),
      addedBy: 'handshake',
      role: 'target',
    });

    this.log('');
    this.log(`  "${result.peerFriendlyName}" added as target.`);
    this.log('');
    this.log('  Pairing complete. The relay connection is closed.');
    this.log('');
  }
}
