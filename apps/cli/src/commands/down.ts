/**
 * Down command - Stop all services
 */

import { CommandDefinition, CommandContext } from '../types/index.js';
import { existsSync } from 'fs';
import { join } from 'path';
import ora from 'ora';
import chalk from 'chalk';

export const downCommand: CommandDefinition = {
  name: 'down',
  description: 'Stop all services',
  options: [
    {
      flags: '-v, --volumes',
      description: 'Remove volumes',
      defaultValue: false,
    },
    {
      flags: '--remove-orphans',
      description: 'Remove containers for services not in compose file',
      defaultValue: false,
    },
    {
      flags: '--rmi <type>',
      description: 'Remove images (all/local)',
    },
  ],
  action: async (context: CommandContext, options: any) => {
    const spinner = ora();
    
    try {
      // Check if project is initialized
      const composeFile = join(process.cwd(), 'docker-compose.yml');
      if (!existsSync(composeFile)) {
        context.logger.error('No docker-compose.yml found. Run "supastorj init" first.');
        process.exit(1);
      }

      // Prepare docker-compose command arguments
      const args = ['-f', composeFile, '-p', 'supastor', 'down'];
      
      if (options.volumes) {
        args.push('-v');
      }
      
      if (options.removeOrphans) {
        args.push('--remove-orphans');
      }
      
      if (options.rmi) {
        args.push('--rmi', options.rmi);
      }

      // Execute docker-compose down
      spinner.start('Stopping services...');
      
      const { execa } = await import('execa');
      
      // Check which docker compose command to use
      let dockerComposeCmd = 'docker-compose';
      try {
        // Try docker compose (v2)
        await execa('docker', ['compose', '--version']);
        dockerComposeCmd = 'docker';
        args.unshift('compose');
      } catch {
        // Fall back to docker-compose (v1)
        try {
          await execa('docker-compose', ['--version']);
        } catch (error) {
          spinner.fail('Docker Compose is not installed or not in PATH');
          context.logger.error('Please install Docker Compose: https://docs.docker.com/compose/install/');
          process.exit(1);
        }
      }
      
      await execa(dockerComposeCmd, args, {
        stdio: 'pipe',
      });
      
      spinner.succeed('Services stopped successfully');
      
      if (options.volumes) {
        console.log(chalk.yellow('⚠  Volumes have been removed'));
      }
      
      if (options.rmi) {
        console.log(chalk.yellow(`⚠  Images have been removed (${options.rmi})`));
      }
      
    } catch (error: any) {
      spinner.fail('Failed to stop services');
      
      // Extract meaningful error message
      if (error.stderr) {
        const errorText = Buffer.isBuffer(error.stderr) 
          ? error.stderr.toString('utf-8')
          : typeof error.stderr === 'string' 
            ? error.stderr 
            : String(error.stderr);
        
        const lines = errorText.split('\n').filter(line => line.trim());
        for (const line of lines) {
          if (line.includes('level=warning')) {
            context.logger.warn(line);
          } else if (line.includes('Error')) {
            context.logger.error(line);
          } else {
            context.logger.info(line);
          }
        }
      } else if (error.message) {
        context.logger.error('Error:', error.message);
      } else {
        context.logger.error('Error:', String(error));
      }
      
      // Additional debugging info
      if (error.command) {
        context.logger.debug('Failed command:', error.command);
      }
      if (error.exitCode) {
        context.logger.debug('Exit code:', error.exitCode);
      }
      
      process.exit(1);
    }
  },
};