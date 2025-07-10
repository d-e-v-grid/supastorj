/**
 * Up command - Start all services
 */

import ora from 'ora';
import chalk from 'chalk';
import { join } from 'path';
import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { createServer } from 'net';
import { readFile } from 'fs/promises';

import { DockerAdapter } from '../adapters/docker-adapter.js';
import { ServiceStatus, CommandContext, CommandDefinition } from '../types/index.js';

// Check if port is available
async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

// Get required ports from docker-compose
async function getRequiredPorts(composeFile: string): Promise<number[]> {
  const content = await readFile(composeFile, 'utf-8');
  const portRegex = /(?:^|\s)(?:-\s*)?["']?(\d+):(\d+)["']?/gm;
  const ports: number[] = [];
  let match;
  
  while ((match = portRegex.exec(content)) !== null) {
    const hostPort = parseInt(match[1]);
    if (!ports.includes(hostPort)) {
      ports.push(hostPort);
    }
  }
  
  return ports;
}

export const upCommand: CommandDefinition = {
  name: 'up',
  description: 'Start all services',
  options: [
    {
      flags: '-d, --detach',
      description: 'Run in detached mode',
      defaultValue: true,
    },
    {
      flags: '--scale <service=count>',
      description: 'Scale services (e.g., --scale storage=3)',
    },
    {
      flags: '--profile <profile>',
      description: 'Docker compose profile to use',
    },
    {
      flags: '--build',
      description: 'Build images before starting containers',
      defaultValue: false,
    },
    {
      flags: '--no-image-transform',
      description: 'Disable image transformation service',
      defaultValue: false,
    },
  ],
  action: async (context: CommandContext, options: any) => {
    const spinner = ora();
    
    try {
      // Check if project is initialized
      const composeFile = join(process.cwd(), 'docker-compose.yml');
      const envFile = join(process.cwd(), '.env');
      
      if (!existsSync(composeFile)) {
        context.logger.error('No docker-compose.yml found. Run "supastorj deploy" first.');
        process.exit(1);
      }
      
      // Check if image transformation is enabled
      let imageTransformEnabled = false;
      if (!options.noImageTransform && existsSync(envFile)) {
        const envContent = await readFile(envFile, 'utf-8');
        const match = envContent.match(/IMAGE_TRANSFORMATION_ENABLED=(.+)/);
        if (match && match[1] === 'true') {
          imageTransformEnabled = true;
        }
      }

      // Check for port conflicts
      spinner.start('Checking port availability...');
      const requiredPorts = await getRequiredPorts(composeFile);
      const occupiedPorts: number[] = [];
      
      for (const port of requiredPorts) {
        if (!(await isPortAvailable(port))) {
          occupiedPorts.push(port);
        }
      }
      
      if (occupiedPorts.length > 0) {
        spinner.fail('Port conflict detected');
        context.logger.error(`The following ports are already in use: ${occupiedPorts.join(', ')}`);
        context.logger.info('Please stop the services using these ports or change the port configuration in .env file');
        process.exit(1);
      }
      spinner.succeed('All required ports are available');

      // Check for .env file and read additional configuration
      let storageBackend = 'file';
      if (existsSync(envFile)) {
        try {
          const envContent = await readFile(envFile, 'utf-8');
          const envVars = dotenv.parse(envContent);
          storageBackend = envVars['STORAGE_BACKEND'] || 'file';
          // imageTransformEnabled is already set above
        } catch (error) {
          context.logger.warn('Could not read .env file, using default configuration');
        }
      }

      // Prepare docker-compose command arguments
      const args = ['-f', composeFile, '-p', 'supastorj', 'up'];
      
      if (options.detach) {
        args.push('-d');
      }
      
      if (options.build) {
        args.push('--build');
      }
      
      if (options.scale) {
        const scales = options.scale.split(',');
        for (const scale of scales) {
          args.push('--scale', scale);
        }
      }
      
      // Handle profiles
      if (options.profile) {
        args.unshift('--profile', options.profile);
      } else {
        // Auto-detect profiles based on configuration
        const profiles: string[] = [];
        
        // Check storage backend
        if (storageBackend === 's3') {
          profiles.push('s3');
          context.logger.info('Using S3 storage backend with MinIO');
        }
        
        // Check image transformation
        if (imageTransformEnabled) {
          profiles.push('imgproxy');
          context.logger.info('Image transformation enabled, including imgproxy service');
        }
        
        // Add profiles to command
        for (const profile of profiles) {
          args.unshift('--profile', profile);
        }
      }

      // Execute docker-compose up
      spinner.start('Starting services...');
      
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
      
      const subprocess = execa(dockerComposeCmd, args, {
        stdio: options.detach ? 'pipe' : 'inherit',
        // Merge stdout and stderr for better logging
        all: true,
      });

      if (options.detach) {
        try {
          await subprocess;
          spinner.succeed('Services started successfully');
        } catch (error: any) {
          // Even if docker-compose returns non-zero, check if services are actually running
          const checkProcess = await execa(dockerComposeCmd, 
            dockerComposeCmd === 'docker' 
              ? ['compose', '-f', composeFile, '-p', 'supastorj', 'ps', '--format', 'json']
              : ['-f', composeFile, '-p', 'supastorj', 'ps', '--format', 'json'],
            { reject: false }
          );
          
          if (checkProcess.stdout && checkProcess.stdout.includes('"State":"running"')) {
            spinner.succeed('Services started (some warnings occurred)');
          } else {
            throw error;
          }
        }
        
        // Load service adapters
        spinner.start('Checking service health...');
        const adapters = await DockerAdapter.fromCompose(
          composeFile,
          'supastorj',
          context.logger
        );
        
        // Filter out one-time setup containers
        const oneTimeContainers = ['minio_setup'];
        const persistentAdapters = adapters.filter(
          adapter => !oneTimeContainers.includes(adapter.name)
        );
        
        // Get list of actually running services
        const runningServices = new Set<string>();
        for (const adapter of persistentAdapters) {
          const status = await adapter.getStatus();
          if (status === ServiceStatus.Running || status === ServiceStatus.Starting) {
            runningServices.add(adapter.name);
          }
        }
        
        // Wait for services to be healthy (only check running services)
        let allHealthy = false;
        let attempts = 0;
        const maxAttempts = 60; // Increase to 2 minutes for storage service
        const serviceErrors: Map<string, string> = new Map();
        
        while (!allHealthy && attempts < maxAttempts) {
          allHealthy = true;
          
          // Update running services list to catch restarting containers
          for (const adapter of persistentAdapters) {
            const status = await adapter.getStatus();
            if (status === ServiceStatus.Running || status === ServiceStatus.Starting || status === ServiceStatus.Restarting) {
              runningServices.add(adapter.name);
              
              // Check for restarting containers (likely auth issues)
              if (status === ServiceStatus.Restarting && adapter.name === 'storage') {
                try {
                  const logs = await adapter.getLogs({ tail: 5 });
                  if (logs.includes('password authentication failed')) {
                    serviceErrors.set(adapter.name, 'Authentication failed - check PostgreSQL credentials');
                  }
                } catch {
                  // Ignore error if we can't get the component
                }
              }
            }
          }
          
          for (const adapter of persistentAdapters) {
            // Skip services that are not running
            if (!runningServices.has(adapter.name)) {
              continue;
            }
            
            const health = await adapter.healthcheck();
            if (!health.healthy) {
              allHealthy = false;
              const errorMsg = serviceErrors.get(adapter.name);
              if (errorMsg) {
                spinner.text = `${adapter.name}: ${errorMsg}`;
              } else {
                spinner.text = `Waiting for ${adapter.name} to be healthy...`;
              }
              break;
            }
          }
          
          if (!allHealthy) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            attempts++;
          }
        }
        
        if (allHealthy) {
          spinner.succeed('All services are healthy');
          
          // Show service status (only show running services)
          console.log('\n' + chalk.bold('Service Status:'));
          for (const adapter of persistentAdapters) {
            // Only show running services
            if (!runningServices.has(adapter.name)) {
              continue;
            }
            
            const status = await adapter.getStatus();
            console.log(
              `  ${chalk.cyan(adapter.name.padEnd(20))} ${
                status === ServiceStatus.Running ? chalk.green('●') : chalk.red('●')
              } ${status}`
            );
          }
          
          console.log('\n' + chalk.gray('Run "supastorj logs -f" to see service logs'));
        } else {
          spinner.warn('Some services may not be healthy');
          context.logger.warn('Check service logs for more information');
        }
      } else {
        // In attached mode, just run docker-compose
        await subprocess;
      }
      
    } catch (error: any) {
      spinner.fail('Failed to start services');
      
      // Extract meaningful error message
      // Use 'all' property which contains both stdout and stderr
      if (error.all) {
        const allText = Buffer.isBuffer(error.all) 
          ? error.all.toString('utf-8')
          : typeof error.all === 'string' 
            ? error.all 
            : String(error.all);
        
        // Split by newlines and log each line separately
        const lines = allText.split('\n').filter(line => line.trim());
        for (const line of lines) {
          if (line.includes('level=warning')) {
            context.logger.warn(line);
          } else if (line.includes('Error') || line.includes('error')) {
            context.logger.error(line);
          } else if (line.includes('Creating') || line.includes('Created') || 
                     line.includes('Starting') || line.includes('Started')) {
            context.logger.info(line);
          } else {
            // Skip less important lines
            context.logger.debug(line);
          }
        }
      } else if (error.stderr) {
        // Fallback to stderr if 'all' is not available
        const errorText = Buffer.isBuffer(error.stderr) 
          ? error.stderr.toString('utf-8')
          : String(error.stderr);
        context.logger.error(errorText);
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