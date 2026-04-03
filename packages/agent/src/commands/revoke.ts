import { Command, Args } from '@oclif/core';
import { loadContext } from '../context.js';
import { createInterface } from 'node:readline';

export default class Revoke extends Command {
  static override description = 'Remove a device from the allow list';

  static override args = {
    deviceId: Args.string({
      description: 'Device ID to revoke (e.g., am_1a2b3c4d5e6f7a8b)',
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(Revoke);

    const { allowList } = await loadContext().catch(() => {
      this.error('No identity found. Run `amesh init` first.');
    });

    const data = await allowList.read();
    const device = data.devices.find((d) => d.deviceId === args.deviceId);
    if (!device) {
      this.error(`Device ${args.deviceId} not found in allow list.`);
    }

    this.log('');
    this.log(`  Device: ${device.friendlyName}`);
    this.log(`  Added:  ${device.addedAt.split('T')[0]}`);
    this.log('');

    const confirmed = await this.confirm(
      '  Are you sure? This device will lose access immediately. (y/N): ',
    );
    if (!confirmed) {
      this.log('  Cancelled.');
      return;
    }

    await allowList.removeDevice(args.deviceId);

    this.log('');
    this.log(`  ${args.deviceId} removed from allow list.`);
    this.log('  Allow list resealed.');
    this.log('');
    this.log('  Revocation is effective immediately on this machine.');
    this.log('  If this device authenticates to other machines, revoke it there too.');
    this.log('');
  }

  private confirm(prompt: string): Promise<boolean> {
    return new Promise((resolve) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      rl.question(prompt, (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'y');
      });
    });
  }
}
