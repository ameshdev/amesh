import { Command } from '@oclif/core';
import { loadContext } from '../context.js';

export default class List extends Command {
  static override description = 'Show trusted devices in the allow list';

  async run(): Promise<void> {
    const { identity, allowList } = await loadContext().catch(() => {
      this.error('No identity found. Run `amesh init` first.');
    });

    let data;
    try {
      data = await allowList.read();
    } catch (err: unknown) {
      if ((err as Error).message.includes('integrity check failed')) {
        this.error(
          'CRITICAL: Allow list integrity check failed — possible tampering.\n' +
            'The file may have been modified outside of amesh.',
        );
      }
      throw err;
    }

    this.log('');
    if (data.devices.length === 0) {
      this.log('  No trusted devices yet.');
      this.log('  Run `amesh listen` to start pairing.');
    } else {
      this.log(`  Trusted Devices (${data.devices.length})`);
      this.log('  ' + '─'.repeat(55));
      for (const device of data.devices) {
        const date = device.addedAt.split('T')[0];
        this.log(`  ${device.deviceId}  ${device.friendlyName.padEnd(25)} added ${date}`);
      }
      this.log('  ' + '─'.repeat(55));
    }

    this.log('');
    this.log(`  Your identity: ${identity.deviceId} (${identity.friendlyName})`);
    this.log('');
  }
}
