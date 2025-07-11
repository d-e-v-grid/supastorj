/**
 * Service management utilities for production deployment
 */

import { $, fs, chalk } from 'zx';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

import { CommandContext } from '../types/index.js';

export interface ServiceConfig {
  name: string;
  displayName: string;
  serviceFile: string;
  sourceDir: string;
  buildCheck: string;
  startCommand: string;
  port: number;
  pidFile: string;
  envPrefix?: string;
}

export const SERVICES: ServiceConfig[] = [
  {
    name: 'storage',
    displayName: 'Storage API',
    serviceFile: 'supastorj-storage.service',
    sourceDir: './storage',
    buildCheck: './storage/dist/start/server.js',
    startCommand: 'node storage/dist/start/server.js',
    port: 5000,
    pidFile: 'storage-api.pid',
  },
  {
    name: 'postgres-meta',
    displayName: 'Postgres Meta API',
    serviceFile: 'supastorj-postgres-meta.service',
    sourceDir: './postgres-meta',
    buildCheck: './postgres-meta/dist/server/server.js',
    startCommand: 'node postgres-meta/dist/server/server.js',
    port: 5001,
    pidFile: 'postgres-meta-api.pid',
    envPrefix: 'PG_META_',
  },
];

export async function startServiceAttached(
  context: CommandContext,
  service: ServiceConfig,
  envVars: Record<string, string>
): Promise<void> {
  const pidFile = join(process.cwd(), '.supastorj', service.pidFile);
  await fs.ensureDir('.supastorj');

  context.logger.info(`Starting ${service.displayName} from source in attached mode...`);

  // Check if source directory exists
  if (!await fs.pathExists(service.sourceDir)) {
    context.logger.error(`${service.sourceDir} directory not found!`);
    context.logger.error('Run "supastorj init prod" first.');
    process.exit(1);
  }

  // Check if built
  if (!await fs.pathExists(service.buildCheck)) {
    context.logger.error(`${service.displayName} not built!`);
    context.logger.error(`Run "npm run build" in the ${service.sourceDir} directory.`);
    process.exit(1);
  }

  // Run migrations for storage
  if (service.name === 'storage') {
    context.logger.info('Running database migrations...');
    try {
      await $`cd storage && npm run db:migrate`;
    } catch {
      context.logger.warn('Migration may have already been applied');
    }
  }

  // Determine port
  let port = service.port;
  if (service.name === 'storage' && envVars['SERVER_PORT']) {
    port = parseInt(envVars['SERVER_PORT']);
  } else if (service.name === 'postgres-meta' && envVars['PG_META_PORT']) {
    port = parseInt(envVars['PG_META_PORT']);
  }

  // Start the server and save PID
  context.logger.info(`Starting ${service.displayName} in attached mode (press Ctrl+C to stop)...`);
  context.logger.info(`Server: http://localhost:${port}`);

  // Write PID of current process which will be replaced by exec
  await fs.writeFile(pidFile, process.pid.toString(), 'utf-8');

  // Use exec to replace the current process
  await $`exec ${service.startCommand}`.pipe(process.stdout);
}

export async function startServiceSystemd(
  context: CommandContext,
  service: ServiceConfig,
  envVars: Record<string, string>
): Promise<void> {
  const systemdServicePath = `/etc/systemd/system/${service.serviceFile}`;

  // Check if systemd is available
  try {
    await $`systemctl --version`;
  } catch {
    context.logger.error('systemd is not available on this system!');
    context.logger.info('Use --attach flag to run in foreground mode.');
    process.exit(1);
  }

  // Check if service exists
  const serviceExists = await fs.pathExists(systemdServicePath);

  if (!serviceExists) {
    context.logger.info(`Creating systemd service for ${service.displayName}...`);

    // Create service file from template
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const templatePath = join(__dirname, `../../templates/${service.serviceFile}`);
    let serviceContent = await fs.readFile(templatePath, 'utf-8');

    // Replace template variables
    const currentUser = (await $`whoami`).stdout.trim();
    serviceContent = serviceContent
      .replace(/{{systemUser}}/g, currentUser)
      .replace(/{{systemGroup}}/g, currentUser)
      .replace(/{{workingDirectory}}/g, process.cwd());

    // For source deployment
    serviceContent = serviceContent
      .replace(/{{#useSource}}/g, '')
      .replace(/{{\/useSource}}/g, '');

    // Write service file (requires sudo)
    context.logger.info('Installing systemd service (requires sudo)...');

    const tempServiceFile = join(process.cwd(), '.supastorj', service.serviceFile);
    await fs.ensureDir('.supastorj');
    await fs.writeFile(tempServiceFile, serviceContent);

    try {
      await $`sudo cp ${tempServiceFile} ${systemdServicePath}`;
      await $`sudo systemctl daemon-reload`;
      context.logger.info(chalk.green('✓') + ` Systemd service created for ${service.displayName}`);
    } catch (error) {
      context.logger.error('Failed to create systemd service. Please run with sudo or use --attach mode.');
      process.exit(1);
    }
  }

  // Start the service
  context.logger.info(`Starting ${service.displayName} systemd service...`);
  try {
    await $`sudo systemctl start ${service.serviceFile}`;
    await $`sudo systemctl enable ${service.serviceFile}`;

    // Wait a moment for service to start
    await $`sleep 2`;

    // Check if service is running
    const status = await $`systemctl is-active ${service.serviceFile}`;
    if (status.stdout.trim() === 'active') {
      let port = service.port;
      if (service.name === 'storage' && envVars['SERVER_PORT']) {
        port = parseInt(envVars['SERVER_PORT']);
      } else if (service.name === 'postgres-meta' && envVars['PG_META_PORT']) {
        port = parseInt(envVars['PG_META_PORT']);
      }

      context.logger.info(chalk.green('✓') + ` ${service.displayName} service started successfully`);
      context.logger.info(`Server: http://localhost:${port}`);
      context.logger.info(`View logs: sudo journalctl -u ${service.serviceFile} -f`);
      context.logger.info(`Check status: sudo systemctl status ${service.serviceFile}`);
    } else {
      throw new Error('Service failed to start');
    }
  } catch (error) {
    context.logger.error(`Failed to start systemd service for ${service.displayName}`);
    context.logger.info(`Check logs: sudo journalctl -u ${service.serviceFile} -n 50`);
    throw error;
  }
}

export async function getEnabledServices(configManager: any): Promise<ServiceConfig[]> {
  const config = await configManager.load();
  const enabled: ServiceConfig[] = [];

  for (const service of SERVICES) {
    if (service.name === 'storage') {
      // Storage is always enabled in production
      enabled.push(service);
    } else if (service.name === 'postgres-meta' && config.services?.postgresMeta?.enabled !== false) {
      // Postgres Meta is enabled by default unless explicitly disabled
      enabled.push(service);
    }
  }

  return enabled;
}