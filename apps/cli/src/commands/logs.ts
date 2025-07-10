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
  action: async (context: CommandContext, services: string[], options: any) => {
    try {
      // Check if project is initialized
      const composeFile = join(process.cwd(), 'docker-compose.yml');
      if (!existsSync(composeFile)) {
        context.logger.error('No docker-compose.yml found. Run "supastorj init" first.');
        process.exit(1);
      }

      // Get service adapters
      const adapters = await DockerAdapter.fromCompose(
        composeFile,
        'supastorj',
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

      // Stream logs for each service
      const streams = selectedAdapters.map(async (adapter) => {
        try {
          const serviceLabel = chalk.cyan(`[${adapter.name}]`);
          
          for await (const line of adapter.logs(logOptions)) {
            console.log(`${serviceLabel} ${line}`);
          }
        } catch (error) {
          context.logger.error(`Error streaming logs for ${adapter.name}:`, error);
        }
      });

      // Wait for all streams to complete (or error)
      await Promise.all(streams);

      // If not following, exit normally
      if (!options.follow) {
        context.logger.info('Log streaming completed');
      }
    } catch (error: any) {
      context.logger.error('Error:', error.message);
      process.exit(1);
    }
  },
};