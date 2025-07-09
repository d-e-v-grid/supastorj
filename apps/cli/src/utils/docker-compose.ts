/**
 * Docker Compose utilities
 */

import { execa } from 'execa';

export interface DockerComposeCommand {
  command: string;
  args: string[];
}

/**
 * Detect which docker compose command to use (v1 or v2)
 * and prepare the command with arguments
 */
export async function getDockerComposeCommand(args: string[]): Promise<DockerComposeCommand> {
  // Try docker compose (v2) first
  try {
    await execa('docker', ['compose', '--version']);
    return {
      command: 'docker',
      args: ['compose', ...args],
    };
  } catch {
    // Fall back to docker-compose (v1)
    try {
      await execa('docker-compose', ['--version']);
      return {
        command: 'docker-compose',
        args,
      };
    } catch (error) {
      throw new Error('Docker Compose is not installed. Please install it from: https://docs.docker.com/compose/install/');
    }
  }
}

/**
 * Execute a docker compose command
 */
export async function execDockerCompose(args: string[], options?: any) {
  const { command, args: finalArgs } = await getDockerComposeCommand(args);
  return execa(command, finalArgs, options);
}