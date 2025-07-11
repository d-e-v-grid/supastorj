import { $, fs, chalk } from 'zx';

import { ConfigManager } from '../config/config-manager.js';
import { CommandContext, CommandDefinition } from '../types/index.js';

// Set zx options
$.verbose = false;

// Detect deployment mode from config
async function getDeploymentMode(configManager: ConfigManager): Promise<string> {
  try {
    const config = await configManager.load();
    // Map environment to deployment mode
    switch (config.environment) {
      case 'production':
        return 'production';
      case 'staging':
        return 'staging';
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

export const stopCommand: CommandDefinition = {
  name: 'stop',
  description: 'Stop Supastorj services',
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
      flags: '-v, --volumes',
      description: 'Remove volumes (Docker Compose only)',
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

      // Load environment variables if .env exists
      const envVars = await loadEnvVars();

      // Detect deployment mode
      let deploymentMode = await getDeploymentMode(configManager);
      if (options.dev) deploymentMode = 'development';
      if (options.prod) deploymentMode = 'production';

      context.logger.info(`Stopping Supastorj services in ${chalk.cyan(deploymentMode)} mode...`);

      // Development mode - Use Docker Compose
      if (deploymentMode === 'development' || deploymentMode === 'staging') {

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
            process.exit(1);
          }
        }

        const projectName = config.projectName || 'supastorj';

        // Stop all services
        context.logger.info('Stopping Docker Compose services...');

        const composeCmd = useDockerCompose ? 'docker-compose' : 'docker';
        const composeArgs = useDockerCompose ? [] : ['compose'];

        composeArgs.push('-f', 'docker-compose.yml', '-p', projectName, 'down');

        if (options.volumes) {
          composeArgs.push('-v');
          context.logger.warn('Removing volumes - all data will be lost!');
        }

        try {
          await $`${composeCmd} ${composeArgs}`;
          context.logger.info(chalk.green('✓') + ' All services stopped successfully!');
        } catch (error) {
          context.logger.error('Failed to stop services');
          throw error;
        }

        // Production mode
      } else if (deploymentMode === 'production') {

        // Check if using Docker or direct execution
        const useDocker = envVars['USE_DOCKER'] === 'true';

        if (useDocker) {
          context.logger.info('Stopping Storage API Docker container...');

          // Check if container exists
          try {
            const containerExists = await $`docker ps -a --format '{{.Names}}' | grep -q '^storage-api$'`.exitCode === 0;

            if (containerExists) {
              // Stop container
              try {
                await $`docker stop storage-api`;
                context.logger.info('Container stopped, removing...');
                await $`docker rm storage-api`;
                context.logger.info(chalk.green('✓') + ' Storage API container stopped and removed');
              } catch (error) {
                context.logger.warn('Container was not running or failed to stop');
              }
            } else {
              context.logger.warn('Container "storage-api" not found');
            }
          } catch {
            context.logger.warn('No running containers found');
          }

        } else {
          context.logger.info('Stopping Storage API process...');

          const pidFile = 'storage-api.pid';

          if (await fs.pathExists(pidFile)) {
            try {
              const pid = (await fs.readFile(pidFile, 'utf-8')).trim();

              // Check if process is running
              try {
                await $`kill -0 ${pid}`;

                // Process is running, kill it
                await $`kill ${pid}`;
                context.logger.info(`Stopping Storage API (PID: ${pid})...`);

                // Wait for process to stop
                let count = 0;
                while (count < 10) {
                  try {
                    await $`kill -0 ${pid}`;
                    await $`sleep 1`;
                    count++;
                  } catch {
                    // Process stopped
                    break;
                  }
                }

                // Force kill if still running
                try {
                  await $`kill -0 ${pid}`;
                  context.logger.warn('Process did not stop gracefully, force killing...');
                  await $`kill -9 ${pid}`;
                } catch {
                  // Process already stopped
                }

                context.logger.info(chalk.green('✓') + ` Storage API stopped (PID: ${pid})`);
              } catch {
                context.logger.warn('Storage API not running (stale PID file)');
              }

              // Remove PID file
              await fs.remove(pidFile);
            } catch (error) {
              context.logger.error('Failed to read PID file');
            }
          } else {
            // No PID file, try to find node process
            try {
              const result = await $`pgrep -f "node.*storage.*server.js"`.text();
              const pids = result.trim().split('\n').filter(p => p);

              if (pids.length > 0) {
                context.logger.info(`Found storage process(es): ${pids.join(', ')}`);
                for (const pid of pids) {
                  try {
                    await $`kill ${pid}`;
                    context.logger.info(`Stopped process ${pid}`);
                  } catch {
                    // Process might have already stopped
                  }
                }
                context.logger.info(chalk.green('✓') + ' Storage API processes stopped');
              } else {
                context.logger.warn('No Storage API process found');
              }
            } catch {
              context.logger.warn('Storage API is not running');
            }
          }
        }

      } else {
        context.logger.error(`Unknown deployment mode: ${deploymentMode}`);
        process.exit(1);
      }

    } catch (error: any) {
      context.logger.error('Failed to stop services');

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