import { $, fs, chalk } from 'zx';
import { createServer } from 'net';

import { ConfigManager } from '../config/config-manager.js';
import { CommandContext, CommandDefinition, StorageBackendType } from '../types/index.js';
import { getEnabledServices, startServiceSystemd, startServiceAttached } from '../utils/service-manager.js';

// Set zx options
$.verbose = false;

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
  const content = await fs.readFile(composeFile, 'utf-8');
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

// Detect deployment mode from config
async function getDeploymentMode(configManager: ConfigManager): Promise<string> {
  try {
    const config = await configManager.load();
    // Map environment to deployment mode
    switch (config.environment) {
      case 'production':
        return 'production';
      default:
        return 'development';
    }
  } catch (error) {
    // Fallback
    return 'development';
  }
}

// Load environment variables
async function loadEnvVars(): Promise<Record<string, string>> {
  const envVars: Record<string, string> = {};

  if (await fs.pathExists('.env')) {
    const envContent = await fs.readFile('.env', 'utf-8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        envVars[match[1]] = match[2];
      }
    });
  }

  return envVars;
}

export const startCommand: CommandDefinition = {
  name: 'start',
  description: 'Start Supastorj services',
  options: [
    {
      flags: '--dev',
      description: 'Force development mode',
      defaultValue: false,
    },
    {
      flags: '--prod',
      description: 'Force production mode',
      defaultValue: false,
    },
    {
      flags: '-a, --attach',
      description: 'Run in attached mode (foreground)',
      defaultValue: false,
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
  ],
  action: async (context: CommandContext, options: any) => {
    try {
      // Check if project is initialized
      const configManager = new ConfigManager();

      const isInitialized = await configManager.isInitialized();
      if (!isInitialized) {
        context.logger.error('Project not initialized. Run "supastorj init" first.');
        process.exit(1);
      }

      // Load configuration
      const config = await configManager.load();

      // Load .env file if exists
      if (!await fs.pathExists('.env')) {
        context.logger.error('.env file not found! Run "supastorj init" first.');
        process.exit(1);
      }

      // Load environment variables
      const envVars = await loadEnvVars();

      // Detect deployment mode
      let deploymentMode = await getDeploymentMode(configManager);
      if (options.dev) deploymentMode = 'development';
      if (options.prod) deploymentMode = 'production';

      // Handle attach mode
      const attachMode = options.attach;

      context.logger.info(`Starting Supastorj in ${chalk.cyan(deploymentMode)} mode...`);

      // Development mode - Use Docker Compose
      if (deploymentMode === 'development') {
        // Check if docker-compose.yml exists
        if (!await fs.pathExists('docker-compose.yml')) {
          context.logger.error('docker-compose.yml not found!');
          process.exit(1);
        }

        // Check which docker compose command to use
        let useDockerCompose = false;
        try {
          await $`docker compose version`;
        } catch {
          try {
            await $`docker-compose version`;
            useDockerCompose = true;
          } catch {
            context.logger.error('Docker Compose is not installed!');
            context.logger.info('Please install Docker Compose: https://docs.docker.com/compose/install/');
            process.exit(1);
          }
        }

        const projectName = config.projectName || 'supastorj';

        // Check port availability
        context.logger.info('Checking port availability...');
        const requiredPorts = await getRequiredPorts('docker-compose.yml');
        const occupiedPorts: number[] = [];

        for (const port of requiredPorts) {
          if (!(await isPortAvailable(port))) {
            occupiedPorts.push(port);
          }
        }

        if (occupiedPorts.length > 0) {
          context.logger.error('Port conflict detected');
          context.logger.error(`The following ports are already in use: ${occupiedPorts.join(', ')}`);
          context.logger.info('Please stop the services using these ports or change the port configuration in .env file');
          process.exit(1);
        }
        context.logger.info(chalk.green('✓') + ' All required ports are available');

        // Build docker-compose command
        const profiles: string[] = [];
        if (options.profile) {
          profiles.push(options.profile);
        } else {
          // Auto-detect profiles based on configuration
          if (config.storageBackend === StorageBackendType.S3) {
            profiles.push('s3');
            context.logger.info('Using S3 storage backend with MinIO');
          }

          if (configManager.isServiceEnabled('imgproxy')) {
            profiles.push('imgproxy');
            context.logger.info('Image transformation enabled, including imgproxy service');
          }

          if (configManager.isServiceEnabled('redis')) {
            profiles.push('redis');
            context.logger.info('Redis caching enabled');
          }
        }

        // Start services
        context.logger.info('Starting services...');

        const composeCmd = useDockerCompose ? 'docker-compose' : 'docker';
        const composeArgs = useDockerCompose ? [] : ['compose'];

        // Add compose file and project name
        composeArgs.push('-f', 'docker-compose.yml', '-p', projectName);

        // Add profiles
        for (const profile of profiles) {
          composeArgs.push('--profile', profile);
        }

        // Add up command
        composeArgs.push('up');

        if (!attachMode) {
          composeArgs.push('-d');
        }

        if (options.build) {
          composeArgs.push('--build');
        }

        if (options.scale) {
          const scales = options.scale.split(',');
          for (const scale of scales) {
            composeArgs.push('--scale', scale);
          }
        }

        if (attachMode) {
          context.logger.info('Starting services in attached mode (press Ctrl+C to stop)...');

          // Run in attached mode with inherited stdio
          await $`${composeCmd} ${composeArgs}`.pipe(process.stdout);
        } else {
          // Run docker compose
          try {
            await $`${composeCmd} ${composeArgs}`.quiet();

            // Wait for services to be healthy
            context.logger.info('Waiting for services to be healthy...');
            await $`sleep 5`;
            context.logger.info(chalk.green('✓') + ' All services started successfully!');

            context.logger.info(`Run ${chalk.cyan('supastorj status')} to check service status`);
            context.logger.info(`Run ${chalk.cyan('supastorj logs -f')} to see service logs`);
          } catch (error) {
            context.logger.error('Failed to start services');
            throw error;
          }
        }

        // Production mode
      } else if (deploymentMode === 'production') {
        // Create logs directory if it doesn't exist
        await fs.ensureDir('logs');

        // Get enabled services
        const enabledServices = await getEnabledServices(configManager);

        if (enabledServices.length === 0) {
          context.logger.error('No services enabled for production mode');
          process.exit(1);
        }

        if (attachMode) {
          // In attach mode, we can only run one service at a time
          if (enabledServices.length > 1) {
            context.logger.warn('Multiple services enabled. In attach mode, only the first service will be started.');
            context.logger.info('Use systemd mode (without --attach) to run all services.');
          }

          // Start the first enabled service in attached mode
          const firstService = enabledServices[0];
          if (firstService) {
            await startServiceAttached(context, firstService, envVars);
          }
        } else {
          // Start all enabled services using systemd
          for (const service of enabledServices) {
            await startServiceSystemd(context, service, envVars);
          }

          context.logger.info(chalk.green('\n✓ All services started successfully!'));
          context.logger.info('\nService endpoints:');
          for (const service of enabledServices) {
            let port = service.port;
            if (service.name === 'storage' && envVars['SERVER_PORT']) {
              port = parseInt(envVars['SERVER_PORT']);
            } else if (service.name === 'postgres-meta' && envVars['PG_META_PORT']) {
              port = parseInt(envVars['PG_META_PORT']);
            }
            context.logger.info(`  ${service.displayName}: http://localhost:${port}`);
          }
        }
      } else {
        context.logger.error(`Unknown deployment mode: ${deploymentMode}`);
        process.exit(1);
      }

    } catch (error: any) {
      context.logger.error('Failed to start services');

      if (error.stderr) {
        context.logger.error(error.stderr.toString());
      } else if (error.message) {
        context.logger.error(error.message);
      } else {
        context.logger.error(String(error));
      }

      process.exit(1);
    }
  },
};