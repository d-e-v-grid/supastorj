/**
 * Status command - Show service status
 */

import React from 'react';
import { join } from 'path';
import { $, chalk } from 'zx';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { spinner } from '@clack/prompts';
import { Box, Text, render, useApp, useInput, useStdin } from 'ink';

import { withInkRender } from '../utils/prompt-wrapper.js';
import { ConfigManager } from '../config/config-manager.js';
import { DockerAdapter } from '../adapters/docker-adapter.js';
import { getEnabledServices } from '../utils/service-manager.js';
import { Environment, ServiceStatus, CommandContext, DeploymentMode, CommandDefinition } from '../types/index.js';

interface ServiceInfo {
  name: string;
  status: string;
  health: string;
  ports: string;
  uptime: string;
}

export const statusCommand: CommandDefinition = {
  name: 'status',
  description: 'Show service status',
  options: [
    {
      flags: '--json',
      description: 'Output in JSON format',
      defaultValue: false,
    },
    {
      flags: '--watch',
      description: 'Watch mode - auto refresh',
      defaultValue: false,
    },
    {
      flags: '-e, --environment <env>',
      description: 'Override environment from config',
    },
  ],
  action: async (context: CommandContext, options: any) => {
    try {
      // Load configuration
      const configManager = new ConfigManager();
      await configManager.load();
      const config = configManager.getConfig();

      // Determine environment
      const environment = options.environment || config.environment || Environment.Development;

      // Handle based on environment
      if (environment === Environment.Development) {
        // Use Docker Compose status
        await showDockerComposeStatus(context, options);
      } else if (environment === Environment.Production) {
        // Use production status
        await showProductionStatus(context, options);
      } else {
        throw new Error(`Unknown environment: ${environment}`);
      }

    } catch (error: any) {

      // Extract meaningful error message
      if (error.stderr) {
        context.logger.error('Error:', error.stderr.toString());
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

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

async function showDockerComposeStatus(context: CommandContext, options: any) {
  // Check if docker-compose.yml exists
  const composeFile = join(process.cwd(), 'docker-compose.yml');
  if (!existsSync(composeFile)) {
    context.logger.error('No docker-compose.yml found. Run "supastorj init" first.');
    process.exit(1);
  }

  // Load configuration to get project name
  const configManager = new ConfigManager();
  await configManager.load();
  const config = configManager.getConfig();
  const projectName = config.projectName || 'supastorj';

  // Flush logger before starting spinner
  context.logger.flush?.();

  const s = spinner();
  s.start('Checking service status...');

  // Load service adapters
  const adapters = await DockerAdapter.fromCompose(
    composeFile,
    projectName,
    context.logger
  );

  // Collect service information
  const services: ServiceInfo[] = [];

  for (const adapter of adapters) {
    try {
      const status = await adapter.getStatus();
      const health = await adapter.healthcheck();
      const info = await adapter.getInfo();

      services.push({
        name: adapter.name,
        status: status === ServiceStatus.Running ? 'running' : status,
        health: health.healthy ? 'healthy' : health.message || 'unhealthy',
        ports: info?.ports?.map(p => p.PublicPort > 0 ? p.PublicPort.toString() : '-').join(', ') || '-',
        uptime: info?.status === 'running' ? formatUptime(info.uptime || 0) : '-',
      });
    } catch (error) {
      services.push({
        name: adapter.name,
        status: 'error',
        health: 'unknown',
        ports: '-',
        uptime: '-',
      });
    }
  }

  s.stop('Service status retrieved');

  if (options.json) {
    // Output as JSON
    console.log(JSON.stringify(services, null, 2));
  } else if (options.watch) {
    // Interactive watch mode using Ink
    // React is already imported at the top of the file

    const StatusTable: React.FC<{ adapters: DockerAdapter[], onExit?: () => void }> = ({ adapters: adapterList, onExit }) => {
      const { exit } = useApp();
      const { setRawMode } = useStdin();
      const [serviceList, setServiceList] = React.useState<ServiceInfo[]>([]);
      const [lastUpdate, setLastUpdate] = React.useState(new Date());

      // Enable raw mode for keyboard input
      React.useEffect(() => {
        setRawMode(true);
        return () => {
          setRawMode(false);
        };
      });

      // Handle keyboard input
      useInput((input, key) => {
        if ((key.ctrl && input === 'c') || input === 'q' || input === 'Q') {
          if (onExit) onExit();
          exit();
        }
      });

      // Function to fetch service status
      const fetchServices = async () => {
        const updatedServices: ServiceInfo[] = [];

        for (const adapter of adapterList) {
          try {
            const status = await adapter.getStatus();
            const health = await adapter.healthcheck();
            const info = await adapter.getInfo();

            updatedServices.push({
              name: adapter.name,
              status: status === ServiceStatus.Running ? 'running' : status,
              health: health.healthy ? 'healthy' : health.message || 'unhealthy',
              ports: info?.ports?.map(p => p.PublicPort > 0 ? p.PublicPort.toString() : '-').join(', ') || '-',
              uptime: info?.status === 'running' ? formatUptime(info.uptime || 0) : '-',
            });
          } catch (error) {
            updatedServices.push({
              name: adapter.name,
              status: 'error',
              health: 'unknown',
              ports: '-',
              uptime: '-',
            });
          }
        }

        setServiceList(updatedServices);
        setLastUpdate(new Date());
      };

      // Initial fetch and interval setup
      React.useEffect(() => {
        fetchServices();

        const interval = setInterval(fetchServices, 2000);

        return () => clearInterval(interval);
      }, []);

      return React.createElement(
        Box,
        { flexDirection: 'column' },
        React.createElement(
          Box,
          null,
          React.createElement(Text, { bold: true }, 'Service'.padEnd(20)),
          React.createElement(Text, { bold: true }, 'Status'.padEnd(12)),
          React.createElement(Text, { bold: true }, 'Health'.padEnd(12)),
          React.createElement(Text, { bold: true }, 'Ports'.padEnd(20)),
          React.createElement(Text, { bold: true }, 'Uptime')
        ),
        ...serviceList.map(svc =>
          React.createElement(
            Box,
            { key: svc.name },
            React.createElement(Text, { color: 'cyan' }, svc.name.padEnd(20)),
            React.createElement(Text, { color: svc.status === 'running' ? 'green' : 'red' }, svc.status.padEnd(12)),
            React.createElement(Text, { color: svc.health === 'healthy' ? 'green' : 'yellow' }, svc.health.padEnd(12)),
            React.createElement(Text, null, svc.ports.padEnd(20)),
            React.createElement(Text, null, svc.uptime)
          )
        ),
        React.createElement(Box, { marginTop: 1 },
          React.createElement(Text, { dimColor: true },
            `Press CTRL+C or Q to exit • Last update: ${lastUpdate.toLocaleTimeString()}`
          )
        )
      );
    };

    // Setup clean exit handler
    const exitHandler = () => {
      // Restore terminal
      process.stdout.write('\u001B[?25h'); // Show cursor
      process.stdout.write('\n'); // Add newline for cleaner exit
      process.exit(0);
    };

    // Handle process exit
    process.on('exit', () => {
      // Ensure terminal is restored on exit
      process.stdout.write('\u001B[?25h'); // Show cursor
    });

    // Render the app with adapters using wrapper
    const app = withInkRender(context.logger, () =>
      render(React.createElement(StatusTable, {
        adapters,
        onExit: exitHandler
      }), {
        exitOnCtrlC: true  // Let Ink handle Ctrl+C properly
      })
    );

    // Wait for app to unmount properly
    app.waitUntilExit().then(() => {
      exitHandler();
    }).catch(() => {
      exitHandler();
    });
  } else {
    // Simple table output
    console.log('\n' + chalk.bold('Service Status:'));
    console.log(chalk.gray('─'.repeat(80)));
    console.log(
      chalk.bold('Service'.padEnd(20)) +
      chalk.bold('Status'.padEnd(12)) +
      chalk.bold('Health'.padEnd(12)) +
      chalk.bold('Ports'.padEnd(20)) +
      chalk.bold('Uptime')
    );
    console.log(chalk.gray('─'.repeat(80)));

    for (const service of services) {
      const statusColor = service.status === 'running' ? chalk.green : chalk.red;
      const healthColor = service.health === 'healthy' ? chalk.green : chalk.yellow;

      console.log(
        chalk.cyan(service.name.padEnd(20)) +
        statusColor(service.status.padEnd(12)) +
        healthColor(service.health.padEnd(12)) +
        service.ports.padEnd(20) +
        service.uptime
      );
    }

    console.log(chalk.gray('─'.repeat(80)));

    const runningCount = services.filter(svc => svc.status === 'running').length;
    const healthyCount = services.filter(svc => svc.health === 'healthy').length;

    console.log('\n' + chalk.gray(
      `${runningCount}/${services.length} services running, ` +
      `${healthyCount}/${services.length} healthy`
    ));
  }
}

async function showProductionStatus(context: CommandContext, options: any) {
  // Flush logger before starting spinner
  context.logger.flush?.();

  const s = spinner();
  s.start('Checking production service status...');

  try {
    // Load configuration to get service details
    const configManager = new ConfigManager();
    await configManager.load();
    const config = configManager.getConfig();

    const services: ServiceInfo[] = [];

    // Check if process is running (for bare metal deployment)
    if (config.deploymentMode === DeploymentMode.BareMetal) {
      // Get enabled services
      const enabledServices = await getEnabledServices(configManager);

      for (const service of enabledServices) {
        const pidPath = join(process.cwd(), '.supastorj', service.pidFile);
        let serviceRunning = false;
        let pidNum = 0;

        // First check systemd service
        try {
          const status = await $`systemctl is-active ${service.serviceFile}`;
          serviceRunning = status.stdout.trim() === 'active';

          if (serviceRunning) {
            try {
              const mainPid = await $`systemctl show -p MainPID ${service.serviceFile}`;
              const pidMatch = mainPid.stdout.match(/MainPID=(\d+)/);
              if (pidMatch && pidMatch[1] && pidMatch[1] !== '0') {
                pidNum = parseInt(pidMatch[1]);
              }
            } catch {
              // Couldn't get PID from systemd
            }
          }
        } catch {
          // systemd not available or service not found, check PID file
          if (existsSync(pidPath)) {
            const pid = await readFile(pidPath, 'utf-8');
            pidNum = parseInt(pid.trim());

            try {
              process.kill(pidNum, 0);
              serviceRunning = true;
            } catch {
              // Process doesn't exist, clean up stale PID file
              $.verbose = false;
              await $`rm -f ${pidPath}`;
            }
          }
        }

        // Get port for the service
        let port = service.port;
        if (service.name === 'storage' && config.services?.storage?.port) {
          port = config.services.storage.port;
        } else if (service.name === 'postgres-meta' && config.services?.postgresMeta?.port) {
          port = config.services.postgresMeta.port;
        }

        services.push({
          name: service.displayName,
          status: serviceRunning ? 'running' : 'stopped',
          health: serviceRunning ? 'operational' : 'not running',
          ports: port.toString(),
          uptime: serviceRunning && pidNum ? `PID: ${pidNum}` : '-',
        });
      }
    } else {
      // For docker deployment in production, check service availability
      const storagePort = config.services?.storage?.port || 5000;
      const storageHost = config.services?.storage?.host || 'localhost';

      services.push({
        name: 'Storage API',
        status: 'external',
        health: 'check manually',
        ports: `${storageHost}:${storagePort}`,
        uptime: '-',
      });

      if (config.services?.postgresMeta?.enabled !== false) {
        const metaPort = config.services?.postgresMeta?.port || 5001;
        const metaHost = config.services?.postgresMeta?.host || 'localhost';

        services.push({
          name: 'Postgres Meta API',
          status: 'external',
          health: 'check manually',
          ports: `${metaHost}:${metaPort}`,
          uptime: '-',
        });
      }
    }

    // Check other configured services by connectivity
    if (config.services?.postgres?.enabled) {
      services.push({
        name: 'postgres',
        status: 'external',
        health: 'check connectivity',
        ports: `${config.services.postgres.host}:${config.services.postgres.port}`,
        uptime: '-',
      });
    }

    if (config.services?.pgBouncer?.enabled) {
      services.push({
        name: 'pgbouncer',
        status: 'external',
        health: 'check connectivity',
        ports: `${config.services.pgBouncer.host}:${config.services.pgBouncer.port}`,
        uptime: '-',
      });
    }

    if (config.services?.minio?.enabled) {
      services.push({
        name: 'minio',
        status: 'external',
        health: 'check connectivity',
        ports: `${config.services.minio.host}:${config.services.minio.port}`,
        uptime: '-',
      });
    }

    if (config.services?.imgproxy?.enabled) {
      services.push({
        name: 'imgproxy',
        status: 'external',
        health: 'check connectivity',
        ports: `${config.services.imgproxy.host}:${config.services.imgproxy.port}`,
        uptime: '-',
      });
    }

    s.stop('Service status retrieved');

    if (options.json) {
      // Output as JSON
      console.log(JSON.stringify(services, null, 2));
    } else {
      // Simple table output
      console.log('\n' + chalk.bold('Service Status (Production):'));
      console.log(chalk.gray('─'.repeat(80)));
      console.log(
        chalk.bold('Service'.padEnd(20)) +
        chalk.bold('Status'.padEnd(12)) +
        chalk.bold('Health'.padEnd(20)) +
        chalk.bold('Connection'.padEnd(25)) +
        chalk.bold('Info')
      );
      console.log(chalk.gray('─'.repeat(80)));

      for (const service of services) {
        const statusColor = service.status === 'running' ? chalk.green :
          service.status === 'stopped' ? chalk.red : chalk.yellow;
        const healthColor = service.health === 'operational' || service.health === 'healthy' ? chalk.green :
          service.health === 'not running' ? chalk.red : chalk.yellow;

        console.log(
          chalk.cyan(service.name.padEnd(20)) +
          statusColor(service.status.padEnd(12)) +
          healthColor(service.health.padEnd(20)) +
          service.ports.padEnd(25) +
          service.uptime
        );
      }

      console.log(chalk.gray('─'.repeat(80)));

      // Additional info based on deployment mode
      if (config.deploymentMode === DeploymentMode.BareMetal) {
        const runningCount = services.filter(svc => svc.status === 'running').length;
        console.log('\n' + chalk.gray(`${runningCount}/${services.length} services running locally`));

        const storageService = services.find(svc => svc.name === 'Storage API' && svc.status === 'running');
        if (storageService) {
          console.log(chalk.gray(`Storage API available at: http://localhost:${storageService.ports}`));
          console.log(chalk.gray('Logs: sudo journalctl -u supastorj-storage.service -f'));
        }

        const metaService = services.find(svc => svc.name === 'Postgres Meta API' && svc.status === 'running');
        if (metaService) {
          console.log(chalk.gray(`Postgres Meta API available at: http://localhost:${metaService.ports}`));
          console.log(chalk.gray('Logs: sudo journalctl -u supastorj-postgres-meta.service -f'));
        }
      } else {
        console.log('\n' + chalk.gray('External services - verify connectivity manually'));
        console.log(chalk.gray('Use connection strings from .env file'));
      }
    }
  } catch (error: any) {
    s.stop('Failed to check production status');
    context.logger.error('Error:', error.message);
  }
}