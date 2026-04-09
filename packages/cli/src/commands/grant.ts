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
    files: Flags.boolean({
      description: 'Grant file transfer access (amesh cp)',
      allowNo: true,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Grant);

    if (flags.shell === undefined && flags.files === undefined) {
      this.error(
        'Specify a permission to grant or revoke.\n' +
          '  Example: amesh grant <device-id> --shell --files',
      );
    }

    const { allowList } = await loadContext().catch(() => {
      this.error('No identity found. Run `amesh init` first.');
    });

    const data = await allowList.read();
    const device = data.devices.find((d) => d.deviceId === args.deviceId);
    if (!device) {
      this.error(
        `Device ${args.deviceId} not found in allow list.\n` +
          'Run `amesh list` to see paired devices.\n' +
          "Note: grant runs on the target — you're granting a controller permission to access this device.",
      );
    }

    const perms: Record<string, boolean> = {};
    if (flags.shell !== undefined) perms.shell = flags.shell;
    if (flags.files !== undefined) perms.files = flags.files;
    await allowList.updatePermissions(args.deviceId, perms);

    this.log('');
    this.log(`  Device: ${device.friendlyName} (${args.deviceId})`);
    if (flags.shell !== undefined) {
      this.log(`  Shell access: ${flags.shell ? 'granted' : 'revoked'}`);
    }
    if (flags.files !== undefined) {
      this.log(`  File transfer: ${flags.files ? 'granted' : 'revoked'}`);
    }
    this.log('');
  }
}
