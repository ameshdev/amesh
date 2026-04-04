import { Command, Args, Flags } from '@oclif/core';
import { loadContext } from '../context.js';

export default class Grant extends Command {
  static override description = 'Grant or revoke permissions for a paired device';

  static override args = {
    deviceId: Args.string({
      description: 'Device ID to modify (e.g., am_1a2b3c4d5e6f7a8b)',
      required: true,
    }),
  };

  static override flags = {
    shell: Flags.boolean({
      description: 'Grant shell access (remote terminal)',
      allowNo: true,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Grant);

    if (flags.shell === undefined) {
      this.error(
        'Specify a permission to grant or revoke. Example: amesh grant <device-id> --shell',
      );
    }

    const { allowList } = await loadContext().catch(() => {
      this.error('No identity found. Run `amesh init` first.');
    });

    const data = await allowList.read();
    const device = data.devices.find((d) => d.deviceId === args.deviceId);
    if (!device) {
      this.error(`Device ${args.deviceId} not found in allow list.`);
    }

    await allowList.updatePermissions(args.deviceId, { shell: flags.shell });

    this.log('');
    this.log(`  Device: ${device.friendlyName} (${args.deviceId})`);
    if (flags.shell) {
      this.log('  Shell access: granted');
      this.log('');
      this.log('  This device can now open remote shells via `amesh shell`.');
    } else {
      this.log('  Shell access: revoked');
    }
    this.log('');
  }
}
