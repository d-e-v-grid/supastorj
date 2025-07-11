import { join } from 'path';
import { $, fs, chalk } from 'zx';

import { ConfigManager } from '../config/config-manager.js';
import { getEnabledServices } from '../utils/service-manager.js';
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
      if (deploymentMode === 'development') {

        // Check if docker-compose.yml exists
        if (!await fs.pathExists('docker-compose.yml')) {
          context.logger.error('docker-compose.yml not found!');
          process.exit(1);
        }

        // Check which docker compose command to use
        let useDockerCompose = false;
        try {
          await $`docker compose version`.quiet();
        } catch {
          try {
            await $`docker-compose version`.quiet();
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
          await $`${composeCmd} ${composeArgs}`.quiet();
          context.logger.info(chalk.green('✓') + ' All services stopped successfully!');
        } catch (error) {
          context.logger.error('Failed to stop services');
          throw error;
        }

        // Production mode
      } else if (deploymentMode === 'production') {
        const enabledServices = await getEnabledServices(configManager);
        let stoppedCount = 0;

        // Stop all enabled services
        for (const service of enabledServices) {
          const pidFile = join(process.cwd(), '.supastorj', service.pidFile);

          // First check if systemd service is running
          let serviceRunning = false;
          try {
            const status = await $`systemctl is-active ${service.serviceFile}`.quiet();
            serviceRunning = status.stdout.trim() === 'active';
          } catch {
            // Service not active or systemd not available
          }

          if (serviceRunning) {
            // Stop systemd service
            context.logger.info(`Stopping ${service.displayName} systemd service...`);
            try {
              await $`sudo systemctl stop ${service.serviceFile}`.quiet();
              context.logger.info(chalk.green('✓') + ` ${service.displayName} service stopped`);
              stoppedCount++;
            } catch (error) {
              context.logger.error(`Failed to stop ${service.displayName} service. Please run with sudo.`);
              throw error;
            }
          } else if (await fs.pathExists(pidFile)) {
            // Stop process using PID file (--attach mode)
            context.logger.info(`Stopping ${service.displayName} process...`);

            try {
              const pidContent = (await fs.readFile(pidFile, 'utf-8')).trim();

              // Regular process with PID
              const pid = pidContent;

              // Check if process is running
              try {
                await $`kill -0 ${pid}`.quiet();

                // Process is running, send SIGTERM
                await $`kill -TERM ${pid}`.quiet();
                context.logger.info(`Stopping ${service.displayName} (PID: ${pid})...`);

                // Wait for graceful shutdown
                let count = 0;
                while (count < 10) {
                  try {
                    await $`kill -0 ${pid}`.quiet();
                    await $`sleep 1`.quiet();
                    count++;
                  } catch {
                    // Process stopped
                    break;
                  }
                }

                // Force kill if still running
                try {
                  await $`kill -0 ${pid}`.quiet();
                  context.logger.warn('Process did not stop gracefully, force killing...');
                  await $`kill -9 ${pid}`.quiet();
                } catch {
                  // Process already stopped
                }

                context.logger.info(chalk.green('✓') + ` ${service.displayName} stopped (PID: ${pid})`);
                stoppedCount++;
              } catch {
                context.logger.warn(`${service.displayName} not running (stale PID file)`);
              }

              // Remove PID file
              await fs.remove(pidFile);
            } catch (error) {
              context.logger.error('Failed to read PID file:', error);
            }
          } else {
            // Try to find running node processes
            try {
              const searchPattern = service.name === 'storage'
                ? "node.*storage.*server.js"
                : "node.*postgres-meta.*server.js";

              const result = await $`pgrep -f "${searchPattern}"`.quiet().text();
              const pids = result.trim().split('\n').filter(p => p);

              if (pids.length > 0) {
                context.logger.info(`Found ${service.displayName} process(es): ${pids.join(', ')}`);
                for (const pid of pids) {
                  try {
                    await $`kill ${pid}`.quiet();
                    context.logger.info(`Stopped process ${pid}`);
                  } catch {
                    // Process might have already stopped
                  }
                }
                context.logger.info(chalk.green('✓') + ` ${service.displayName} processes stopped`);
                stoppedCount++;
              } else {
                context.logger.warn(`No ${service.displayName} processes found`);
              }
            } catch {
              context.logger.warn(`${service.displayName} is not running`);
            }
          }
        }

        if (stoppedCount > 0) {
          context.logger.info(chalk.green(`\n✓ Stopped ${stoppedCount} service(s) successfully!`));
        } else {
          context.logger.warn('No running services found');
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