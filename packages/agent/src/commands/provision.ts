import { Command, Flags } from '@oclif/core';
import { loadContext } from '../context.js';
import { generateBootstrapToken } from '../bootstrap-token.js';

const DEFAULT_RELAY = 'wss://relay.authmesh.dev/ws';

function parseTTL(ttl: string): number {
  const match = ttl.match(/^(\d+)(m|h)$/);
  if (!match) throw new Error('Invalid TTL format. Use e.g. 30m, 1h, 24h');
  const [, num, unit] = match;
  return parseInt(num) * (unit === 'h' ? 3600 : 60);
}

export default class Provision extends Command {
  static override description = 'Generate a bootstrap token for automated device pairing';

  static override flags = {
    name: Flags.string({
      char: 'n',
      description: 'Friendly name for the device being provisioned',
      required: true,
    }),
    ttl: Flags.string({
      char: 't',
      description: 'Token validity period (e.g. 30m, 1h, 24h)',
      default: '1h',
    }),
    relay: Flags.string({
      char: 'r',
      description: 'Relay server URL',
      default: DEFAULT_RELAY,
      env: 'AMESH_RELAY_URL',
    }),
    output: Flags.string({
      char: 'o',
      description: 'Output format',
      options: ['text', 'json'],
      default: 'text',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Provision);

    const { identity, keyStore, keyAlias } = await loadContext().catch(() => {
      this.error('No identity found. Run `amesh init` first.');
    });

    const ttlSeconds = parseTTL(flags.ttl);

    const { token, payload } = await generateBootstrapToken({
      issuerDeviceId: identity.deviceId,
      keyAlias,
      name: flags.name,
      ttlSeconds,
      relay: flags.relay,
      keyStore,
    });

    if (flags.output === 'json') {
      this.log(
        JSON.stringify({
          token,
          jti: payload.jti,
          name: payload.name,
          issuedAt: new Date(payload.iat * 1000).toISOString(),
          expiresAt: new Date(payload.exp * 1000).toISOString(),
          relay: payload.relay,
        }),
      );
      return;
    }

    this.log('');
    this.log('  Bootstrap token generated.');
    this.log('');
    this.log(`  Token (valid for ${flags.ttl}, single use):`);
    this.log('');
    this.log(`  ${token}`);
    this.log('');
    this.log('  Usage:');
    this.log('    Set this as an environment variable on the target:');
    this.log(`    AMESH_BOOTSTRAP_TOKEN=${token}`);
    this.log('');
    this.log('  On first boot, the target will pair automatically.');
    this.log('');
  }
}
