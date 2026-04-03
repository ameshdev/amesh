import { Command, Args, Flags } from '@oclif/core';

export default class Shell extends Command {
  static override description = 'Open a remote shell to a paired device';

  static override args = {
    device: Args.string({
      description: 'Device ID (am_...) or friendly name of the target',
      required: true,
    }),
  };

  static override flags = {
    command: Flags.string({
      char: 'c',
      description: 'Run a single command and exit',
    }),
    relay: Flags.string({
      char: 'r',
      description: 'Relay server URL',
      default: 'wss://relay.authmesh.dev/ws',
      env: 'AMESH_RELAY_URL',
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Shell);

    const { connectShell } = await import('../shell-client.js');
    const exitCode = await connectShell({
      target: args.device,
      relayUrl: flags.relay,
      command: flags.command,
    });

    this.exit(exitCode);
  }
}
