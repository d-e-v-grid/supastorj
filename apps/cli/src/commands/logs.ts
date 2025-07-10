/**
 * Logs command - View service logs
 */

import chalk from 'chalk';
import { join } from 'path';
import { existsSync } from 'fs';

import { DockerAdapter } from '../adapters/docker-adapter.js';
import { CommandContext, CommandDefinition } from '../types/index.js';

export const logsCommand: CommandDefinition = {
  name: 'logs',
  description: 'View service logs',
  options: [
    {
      flags: '-f, --follow',
      description: 'Follow log output',
      defaultValue: false,
    },
    {
      flags: '-t, --tail <lines>',
      description: 'Number of lines to show from the end of the logs',
      defaultValue: 100,
    },
    {
      flags: '--timestamps',
      description: 'Show timestamps',
      defaultValue: false,
    },
  ],
  action: async (context: CommandContext, options: any, services?: string[]) => {
    try {
      // Check if project is initialized
      const composeFile = join(process.cwd(), 'docker-compose.yml');
      if (!existsSync(composeFile)) {
        context.logger.error('No docker-compose.yml found. Run "supastorj init" first.');
        process.exit(1);
      }

      // Load configuration to get project name
      const { ConfigManager } = await import('../config/config-manager.js');
      const configManager = new ConfigManager();
      await configManager.load();
      const config = configManager.getConfig();
      const projectName = config.projectName || 'supastorj';

      // Get service adapters
      const adapters = await DockerAdapter.fromCompose(
        composeFile,
        projectName,
        context.logger
      );

      // Filter adapters based on requested services
      let selectedAdapters = adapters;
      if (services && services.length > 0) {
        selectedAdapters = [];
        for (const serviceName of services) {
          const adapter = adapters.find(a => a.name === serviceName);
          if (adapter) {
            selectedAdapters.push(adapter);
          } else {
            context.logger.warn(`Service not found: ${serviceName}`);
          }
        }
      }

      if (selectedAdapters.length === 0) {
        context.logger.warn('No services found to show logs for');
        return;
      }

      // Show logs for each service
      const logOptions = {
        follow: options.follow,
        tail: parseInt(options.tail) || 100,
      };
      
      // Track active streams for cleanup
      const abortControllers: AbortController[] = [];
      let isShuttingDown = false;

      // Handle graceful shutdown
      const cleanup = () => {
        if (isShuttingDown) return;
        isShuttingDown = true;
        
        console.log('\n' + chalk.yellow('Stopping log stream...'));
        
        // Abort all active streams
        for (const controller of abortControllers) {
          controller.abort();
        }
        
        // Small delay to allow streams to clean up
        setTimeout(() => {
          process.exit(0);
        }, 100);
      };

      // Register signal handlers - use once to prevent multiple registrations
      process.once('SIGINT', () => {
        context.logger.debug('SIGINT received');
        cleanup();
      });
      process.once('SIGTERM', () => {
        context.logger.debug('SIGTERM received');
        cleanup();
      });
      
      // Set raw mode to properly handle Ctrl+C if we're in a TTY
      if (process.stdin.isTTY && options.follow) {
        process.stdin.setRawMode(true);
        
        // Handle keyboard input for Ctrl+C
        process.stdin.on('data', (data) => {
          // Ctrl+C is \x03
          if (data.toString() === '\x03') {
            context.logger.debug('Ctrl+C detected');
            cleanup();
          }
        });
      }
      
      // For debugging - check if handlers are registered
      context.logger.debug(`SIGINT listeners: ${process.listenerCount('SIGINT')}`);
      context.logger.debug(`Process is TTY: ${process.stdin.isTTY}`);
      
      // Also handle process termination
      process.once('exit', () => {
        if (!isShuttingDown) {
          cleanup();
        }
      });

      // Stream logs for each service
      const streams = selectedAdapters.map(async (adapter) => {
        const abortController = new AbortController();
        abortControllers.push(abortController);
        
        try {
          const serviceLabel = chalk.cyan(`[${adapter.name}]`);
          
          // Pass abort signal to adapter
          const extendedOptions = {
            ...logOptions,
            signal: abortController.signal
          };
          
          for await (const line of adapter.logs(extendedOptions)) {
            if (abortController.signal.aborted || isShuttingDown) break;
            console.log(`${serviceLabel} ${line}`);
          }
        } catch (error: any) {
          // Ignore abort errors and shutdown errors
          if (error.name === 'AbortError' || 
              error.code === 'ECONNRESET' || 
              error.message?.includes('aborted') ||
              isShuttingDown) {
            return;
          }
          
          // Only log other errors if not shutting down
          if (!isShuttingDown) {
            context.logger.error(`Error streaming logs for ${adapter.name}:`, error.message);
          }
        }
      });

      try {
        // Wait for all streams to complete (or error)
        await Promise.all(streams);
      } catch (error) {
        // Ignore errors during shutdown
        if (!isShuttingDown) {
          throw error;
        }
      } finally {
        // Clean up signal handlers
        process.removeListener('SIGINT', cleanup);
        process.removeListener('SIGTERM', cleanup);
        process.removeAllListeners('exit');
        
        // Restore stdin mode and remove data listener
        if (process.stdin.isTTY && options.follow) {
          process.stdin.setRawMode(false);
          process.stdin.removeAllListeners('data');
        }
      }

      // If not following, exit normally
      if (!options.follow && !isShuttingDown) {
        context.logger.info('Log streaming completed');
      }
    } catch (error: any) {
      context.logger.error('Error:', error.message);
      process.exit(1);
    }
  },
};