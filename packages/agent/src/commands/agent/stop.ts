import { Command } from '@oclif/core';
import { readFile, unlink } from 'node:fs/promises';
import { getPidPath } from '../../paths.js';

export default class AgentStop extends Command {
  static override description = 'Stop the running amesh agent daemon';

  async run(): Promise<void> {
    await this.parse(AgentStop);

    const pidPath = getPidPath();
    let pid: number;
    try {
      const content = await readFile(pidPath, 'utf-8');
      pid = parseInt(content.trim(), 10);
      if (isNaN(pid)) throw new Error('invalid pid');
    } catch {
      this.error(
        'No running agent found.\n' +
          'The agent may not be running, or the PID file is missing.\n' +
          `Expected PID file at: ${pidPath}`,
      );
    }

    try {
      process.kill(pid, 'SIGTERM');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ESRCH') {
        // Process doesn't exist — clean up stale PID file
        await unlink(pidPath).catch(() => {});
        this.error(`Agent process ${pid} is not running (stale PID file removed).`);
      }
      throw err;
    }

    // Clean up PID file (agent's SIGTERM handler also removes it, but be safe)
    await unlink(pidPath).catch(() => {});

    this.log('');
    this.log(`  Agent (PID ${pid}) stopped.`);
    this.log('');
  }
}
