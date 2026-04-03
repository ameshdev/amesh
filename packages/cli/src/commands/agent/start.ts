import { Command, Flags } from '@oclif/core';

export default class AgentStart extends Command {
  static override description = 'Start the amesh agent daemon (accepts remote shell connections)';

  static override flags = {
    relay: Flags.string({
      char: 'r',
      description: 'Relay server URL',
      default: 'wss://relay.authmesh.dev/ws',
      env: 'AMESH_RELAY_URL',
    }),
    'allow-root': Flags.boolean({
      description: 'Allow running as root (grants root shells to all controllers)',
      default: false,
    }),
    'idle-timeout': Flags.integer({
      description: 'Idle session timeout in minutes',
      default: 30,
      min: 1,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AgentStart);

    const { startAgent } = await import('../../agent.js');
    await startAgent({
      relayUrl: flags.relay,
      allowRoot: flags['allow-root'],
      idleTimeoutMinutes: flags['idle-timeout'],
    });
  }
}
