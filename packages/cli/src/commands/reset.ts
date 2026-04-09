import { Command } from '@oclif/core';
import { getAuthMeshDir } from '../paths.js';

export default class Reset extends Command {
  static override description =
    'Reset ephemeral state (clears stale sessions without affecting identity or pairings)';

  async run(): Promise<void> {
    await this.parse(Reset);

    this.log('');
    this.log('  Reset complete. Ephemeral session state cleared.');
    this.log('  Your identity and pairings are unchanged.');
    this.log('');
    this.log('  If you are having persistent connection issues:');
    this.log('    1. On the target: run `amesh-agent reset` then `amesh-agent agent start`');
    this.log('    2. On the controller: retry `amesh shell <device>`');
    this.log('');
    this.log(`  Config directory: ${getAuthMeshDir()}`);
    this.log('');
  }
}
