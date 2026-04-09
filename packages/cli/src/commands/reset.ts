import { Command } from '@oclif/core';
import { readFile, unlink } from 'node:fs/promises';
import { getAuthMeshDir, getPidPath } from '../paths.js';

export default class Reset extends Command {
  static override description =
    'Reset ephemeral state (stops agent, clears stale sessions without affecting identity or pairings)';

  async run(): Promise<void> {
    await this.parse(Reset);

    this.log('');
    this.log('  Resetting agent state...');

    // Stop running agent if any
    const pidPath = getPidPath();
    try {
      const content = await readFile(pidPath, 'utf-8');
      const pid = parseInt(content.trim(), 10);
      if (!isNaN(pid)) {
        try {
          process.kill(pid, 'SIGTERM');
          this.log(`  Stopped running agent (PID ${pid}).`);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ESRCH') {
            this.log(`  Stale PID file found (process ${pid} not running).`);
          }
        }
      }
    } catch {
      // No PID file — agent not running
    }

    await unlink(pidPath).catch(() => {});

    this.log('');
    this.log('  Reset complete. Ephemeral session state cleared.');
    this.log('  Your identity and pairings are unchanged.');
    this.log('');
    this.log('  To reconnect:');
    this.log('    amesh agent start');
    this.log('');
    this.log(`  Config directory: ${getAuthMeshDir()}`);
    this.log('');
  }
}
