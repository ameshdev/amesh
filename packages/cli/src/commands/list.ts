import { Command } from '@oclif/core';
import { loadContext } from '../context.js';

const BACKEND_LABELS: Record<string, string> = {
  'secure-enclave': 'Secure Enclave',
  'keychain': 'macOS Keychain',
  'tpm2': 'TPM 2.0',
  'encrypted-file': 'Encrypted file',
};

export default class List extends Command {
  static override description = 'Show this device and trusted devices in the allow list';

  async run(): Promise<void> {
    await this.parse(List);
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
    this.log('  This device');
    this.log('  ' + '─'.repeat(55));
    this.log(`  Device ID     : ${identity.deviceId}`);
    this.log(`  Friendly Name : ${identity.friendlyName}`);
    this.log(`  Backend       : ${BACKEND_LABELS[identity.storageBackend] ?? identity.storageBackend}`);
    this.log(`  Created       : ${identity.createdAt.split('T')[0]}`);
    this.log('');

    if (data.devices.length === 0) {
      this.log('  No trusted devices yet.');
      this.log('  Run `amesh listen` to start pairing.');
    } else {
      this.log(`  Trusted Devices (${data.devices.length})`);
      this.log('  ' + '─'.repeat(55));
      for (const device of data.devices) {
        const date = device.addedAt.split('T')[0];
        const roleTag = device.role === 'controller' ? '[controller]' : '[target]';
        this.log(`  ${device.deviceId}  ${device.friendlyName.padEnd(25)} ${roleTag.padEnd(14)} added ${date}`);
      }
      this.log('  ' + '─'.repeat(55));
    }

    this.log('');
  }
}
