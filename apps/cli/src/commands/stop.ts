/**
 * Stop command - Stop services based on environment configuration
 */

import { CommandDefinition, CommandContext, Environment } from '../types/index.js';
import { existsSync } from 'fs';
import { join } from 'path';
import ora from 'ora';
import chalk from 'chalk';
import { execa } from 'execa';
import { ConfigManager } from '../config/config-manager.js';

export const stopCommand: CommandDefinition = {
  name: 'stop',
  description: 'Stop services based on environment configuration',
  options: [
    {
      flags: '-e, --environment <env>',
      description: 'Override environment from config',
    },
  ],
  action: async (context: CommandContext, options: any) => {
    const spinner = ora();
    
    try {
      // Load configuration
      const configManager = new ConfigManager();
      await configManager.load();
      const config = configManager.getConfig();
      
      // Determine environment to use
      const environment = options.environment || config.environment || Environment.Development;
      
      context.logger.info(`Stopping services for ${chalk.cyan(environment)} environment`);
      
      // Handle based on environment
      if (environment === Environment.Development || environment === Environment.Staging) {
        // Use Docker Compose for development/staging
        await stopDockerCompose(context, options);
      } else if (environment === Environment.Production) {
        // Use bare metal deployment for production
        await stopProduction(context, options);
      } else {
        throw new Error(`Unknown environment: ${environment}`);
      }
      
    } catch (error: any) {
      spinner.fail('Failed to stop services');
      context.logger.error('Error:', error.message);
      process.exit(1);
    }
  },
};

async function stopDockerCompose(context: CommandContext, options: any) {
  // Load configuration to get project name
  const configManager = new ConfigManager();
  await configManager.load();
  const config = configManager.getConfig();
  const projectName = config.projectName || 'supastorj';
  const spinner = ora();
  
  // Check if docker-compose.yml exists
  const composeFile = join(process.cwd(), 'docker-compose.yml');
  if (!existsSync(composeFile)) {
    context.logger.error('No docker-compose.yml found.');
    process.exit(1);
  }
  
  spinner.start('Stopping services with Docker Compose...');
  
  try {
    // Check which docker compose command to use
    let dockerComposeCmd = 'docker-compose';
    let args = ['-f', composeFile, '-p', projectName, 'down'];
    
    try {
      await execa('docker', ['compose', '--version']);
      dockerComposeCmd = 'docker';
      args = ['compose', '-f', composeFile, '-p', projectName, 'down'];
    } catch {
      try {
        await execa('docker-compose', ['--version']);
      } catch (error) {
        spinner.fail('Docker Compose is not installed');
        context.logger.error('Please install Docker Compose: https://docs.docker.com/compose/install/');
        process.exit(1);
      }
    }
    
    // Execute docker-compose down
    await execa(dockerComposeCmd, args, {
      stdio: 'pipe',
    });
    
    spinner.succeed('Services stopped successfully');
    
  } catch (error: any) {
    spinner.fail('Failed to stop services');
    throw error;
  }
}

async function stopProduction(context: CommandContext, options: any) {
  const spinner = ora();
  
  try {
    // Check for stop script
    const stopScript = join(process.cwd(), 'stop-storage.sh');
    if (!existsSync(stopScript)) {
      // Try to stop using PID file directly
      const pidFile = join(process.cwd(), 'storage-api.pid');
      if (!existsSync(pidFile)) {
        context.logger.error('Storage API is not running (no PID file found)');
        process.exit(1);
      }
      
      spinner.start('Stopping Storage API...');
      
      try {
        // Read PID and kill process
        const pid = await execa('cat', [pidFile]);
        await execa('kill', [pid.stdout.trim()]);
        await execa('rm', ['-f', pidFile]);
        
        spinner.succeed('Storage API stopped');
      } catch (error) {
        spinner.fail('Failed to stop Storage API');
        context.logger.error('You may need to stop the process manually');
        throw error;
      }
    } else {
      // Use stop script
      spinner.start('Stopping Storage API...');
      
      try {
        const result = await execa('bash', [stopScript], {
          stdio: 'pipe'
        });
        
        if (result.stdout) {
          spinner.succeed('Storage API stopped');
          context.logger.info(result.stdout);
        } else {
          spinner.succeed('Storage API stopped');
        }
      } catch (error: any) {
        spinner.fail('Failed to stop Storage API');
        throw error;
      }
    }
    
  } catch (error: any) {
    context.logger.error('Error:', error.message);
    
    if (error.stderr) {
      context.logger.error('Details:', error.stderr);
    }
    
    process.exit(1);
  }
}