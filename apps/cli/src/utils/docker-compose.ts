/**
 * Docker Compose utilities
 */

import { $ } from 'zx';

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
    $.verbose = false;
    await $`docker compose --version`;
    return {
      command: 'docker',
      args: ['compose', ...args],
    };
  } catch {
    // Fall back to docker-compose (v1)
    try {
      $.verbose = false;
      await $`docker-compose --version`;
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
  
  // Set zx options based on provided options
  const prevVerbose = $.verbose;
  const prevCwd = $.cwd;
  
  try {
    if (options?.cwd) {
      $.cwd = options.cwd;
    }
    
    // Default to not verbose unless explicitly set
    $.verbose = options?.stdio === 'inherit';
    
    // Execute command with proper argument handling
    const result = await $`${command} ${finalArgs}`;
    
    // Return result in a format similar to execa
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode || 0,
      all: result.stdout + (result.stderr || ''),
    };
  } finally {
    // Restore previous settings
    $.verbose = prevVerbose;
    if (prevCwd !== undefined) {
      $.cwd = prevCwd;
    }
  }
}