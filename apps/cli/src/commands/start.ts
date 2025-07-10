/**
 * Start command - Start services based on environment configuration
 */

import { CommandDefinition, CommandContext, Environment } from '../types/index.js';
import { existsSync } from 'fs';
import { join } from 'path';
import ora from 'ora';
import chalk from 'chalk';
import { execa } from 'execa';
import { readFile } from 'fs/promises';
import dotenv from 'dotenv';
import { ConfigManager } from '../config/config-manager.js';

export const startCommand: CommandDefinition = {
  name: 'start',
  description: 'Start services based on environment configuration',
  options: [
    {
      flags: '-a, --attach',
      description: 'Run in attached mode (foreground)',
      defaultValue: false,
    },
    {
      flags: '--storage-dir <dir>',
      description: 'Path to storage source directory (production only)',
      defaultValue: './storage',
    },
    {
      flags: '--env <file>',
      description: 'Environment file to use',
      defaultValue: '.env',
    },
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
      
      context.logger.info(`Starting services for ${chalk.cyan(environment)} environment`);
      
      // Handle based on environment
      if (environment === Environment.Development || environment === Environment.Staging) {
        // Use Docker Compose for development/staging
        await startDockerCompose(context, options, configManager);
      } else if (environment === Environment.Production) {
        // Use bare metal deployment for production
        await startProduction(context, options, configManager);
      } else {
        throw new Error(`Unknown environment: ${environment}`);
      }
      
    } catch (error: any) {
      spinner.fail('Failed to start services');
      context.logger.error('Error:', error.message);
      process.exit(1);
    }
  },
};

async function startDockerCompose(context: CommandContext, options: any, configManager: ConfigManager) {
  const spinner = ora();
  
  // Check if docker-compose.yml exists
  const composeFile = join(process.cwd(), 'docker-compose.yml');
  if (!existsSync(composeFile)) {
    context.logger.error('No docker-compose.yml found. Run "supastorj init" first.');
    process.exit(1);
  }
  
  spinner.start('Starting services with Docker Compose...');
  
  try {
    // Get project name from configuration
    const config = configManager.getConfig();
    const projectName = config.projectName || 'supastorj';
    
    // Prepare docker-compose command
    const args = ['-f', composeFile, '-p', projectName, 'up'];
    // Run in detached mode by default unless --attach is specified
    if (!options.attach) {
      args.push('-d');
    }
    
    // Check which docker compose command to use
    let dockerComposeCmd = 'docker-compose';
    try {
      await execa('docker', ['compose', '--version']);
      dockerComposeCmd = 'docker';
      args.unshift('compose');
    } catch {
      try {
        await execa('docker-compose', ['--version']);
      } catch (error) {
        spinner.fail('Docker Compose is not installed');
        context.logger.error('Please install Docker Compose: https://docs.docker.com/compose/install/');
        process.exit(1);
      }
    }
    
    spinner.stop();
    
    // Execute docker-compose up
    const subprocess = execa(dockerComposeCmd, args, {
      stdio: options.attach ? 'inherit' : 'pipe',
    });
    
    if (!options.attach) {
      await subprocess;
      spinner.succeed('Services started successfully');
      context.logger.info('Run "supastorj status" to check service status');
      context.logger.info('Run "supastorj logs -f" to see service logs');
    } else {
      await subprocess;
    }
    
  } catch (error: any) {
    spinner.fail('Failed to start services');
    throw error;
  }
}

async function startProduction(context: CommandContext, options: any, configManager: ConfigManager) {
  const spinner = ora();
  
  try {
    // Check if storage directory exists
    const storageDir = join(process.cwd(), options.storageDir);
    if (!existsSync(storageDir)) {
      context.logger.error(`Storage directory not found: ${storageDir}`);
      context.logger.info('Run "supastorj init prod" first to build storage from source');
      process.exit(1);
    }
    
    // Check if built files exist
    const serverPath = join(storageDir, 'dist/start/server.js');
    if (!existsSync(serverPath)) {
      context.logger.error('Storage server not built');
      context.logger.info('Run "supastorj init prod" first to build storage from source');
      process.exit(1);
    }
    
    // Check environment file
    const envPath = join(process.cwd(), options.env);
    if (!existsSync(envPath)) {
      context.logger.error(`Environment file not found: ${envPath}`);
      context.logger.info('Create a .env file with your configuration');
      process.exit(1);
    }
    
    // Load environment variables
    const envContent = await readFile(envPath, 'utf-8');
    const envVars = dotenv.parse(envContent);
    
    const serverHost = envVars['SERVER_HOST'] || '0.0.0.0';
    const serverPort = envVars['SERVER_PORT'] || '5000';
    
    if (!options.attach) {
      // Run in background using the start script
      const startScript = join(process.cwd(), 'start-storage.sh');
      if (!existsSync(startScript)) {
        context.logger.error('Start script not found');
        context.logger.info('Run "supastorj init prod" first to generate startup scripts');
        process.exit(1);
      }
      
      spinner.start('Starting Storage API in background...');
      
      try {
        await execa('bash', [startScript], {
          stdio: 'pipe',
          env: { ...process.env, ...envVars }
        });
        
        spinner.succeed('Storage API started in background');
        context.logger.info(`API available at: http://${serverHost}:${serverPort}`);
        context.logger.info('Check logs: tail -f logs/storage-api.log');
        context.logger.info('Stop with: supastorj stop');
      } catch (error: any) {
        spinner.fail('Failed to start Storage API');
        throw error;
      }
    } else {
      // Run in foreground
      spinner.start('Starting Storage API...');
      spinner.stop();
      
      context.logger.info(chalk.cyan('Starting Supabase Storage API'));
      context.logger.info(`Server: http://${serverHost}:${serverPort}`);
      context.logger.info(chalk.gray('Press Ctrl+C to stop'));
      
      // Start the server
      await execa('node', [serverPath], {
        stdio: 'inherit',
        cwd: storageDir,
        env: { ...process.env, ...envVars }
      });
    }
    
  } catch (error: any) {
    spinner.fail('Failed to start Storage API');
    context.logger.error('Error:', error.message);
    
    if (error.stderr) {
      context.logger.error('Details:', error.stderr);
    }
    
    process.exit(1);
  }
}