/**
 * Status command - Show service status
 */

import ora, { type Ora } from 'ora';
import chalk from 'chalk';
import React from 'react';
import { join } from 'path';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { Box, Text, render, useApp, useInput } from 'ink';
import { execa } from 'execa';
import dotenv from 'dotenv';

import { DockerAdapter } from '../adapters/docker-adapter.js';
import { ServiceStatus, CommandContext, CommandDefinition, Environment } from '../types/index.js';
import { ConfigManager } from '../config/config-manager.js';

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
    const spinner = ora();
    
    try {
      // Load configuration
      const configManager = new ConfigManager();
      await configManager.load();
      const config = configManager.getConfig();
      
      // Determine environment
      const environment = options.environment || config.environment || Environment.Development;
      
      // Handle based on environment
      if (environment === Environment.Development || environment === Environment.Staging) {
        // Use Docker Compose status
        await showDockerComposeStatus(context, options, spinner);
      } else if (environment === Environment.Production) {
        // Use production status
        await showProductionStatus(context, options, spinner);
      } else {
        throw new Error(`Unknown environment: ${environment}`);
      }
      
    } catch (error: any) {
      spinner.fail('Failed to check service status');
      
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

async function showDockerComposeStatus(context: CommandContext, options: any, spinner: Ora) {
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

  spinner.start('Checking service status...');
  
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
  
  spinner.stop();
  
  if (options.json) {
    // Output as JSON
    console.log(JSON.stringify(services, null, 2));
  } else if (options.watch) {
    // Interactive watch mode using Ink
    const { useState, useEffect } = React;
    
    const StatusTable: React.FC<{ adapters: DockerAdapter[], onExit?: () => void }> = ({ adapters: adapterList, onExit }) => {
      const { exit } = useApp();
      const [services, setServices] = useState<ServiceInfo[]>([]);
      const [lastUpdate, setLastUpdate] = useState(new Date());
      
      // Handle keyboard input
      useInput((input, key) => {
        if ((key.ctrl && input === 'c') || input === 'q') {
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
        
        setServices(updatedServices);
        setLastUpdate(new Date());
      };
      
      // Initial fetch and interval setup
      useEffect(() => {
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
        ...services.map(s => 
          React.createElement(
            Box,
            { key: s.name },
            React.createElement(Text, { color: 'cyan' }, s.name.padEnd(20)),
            React.createElement(Text, { color: s.status === 'running' ? 'green' : 'red' }, s.status.padEnd(12)),
            React.createElement(Text, { color: s.health === 'healthy' ? 'green' : 'yellow' }, s.health.padEnd(12)),
            React.createElement(Text, null, s.ports.padEnd(20)),
            React.createElement(Text, null, s.uptime)
          )
        ),
        React.createElement(Box, { marginTop: 1 },
          React.createElement(Text, { dimColor: true }, 
            `Press Ctrl+C or Q to exit • Last update: ${lastUpdate.toLocaleTimeString()}`
          )
        )
      );
    };
    
    // Setup signal handlers before starting the app
    const exitHandler = () => {
      // Restore terminal
      process.stdout.write('\u001B[?25h'); // Show cursor
      process.exit(0);
    };
    
    // Handle exit - clean up interval when process exits
    process.on('SIGINT', exitHandler);
    process.on('SIGTERM', exitHandler);
    process.on('exit', () => {
      // Ensure terminal is restored on exit
      process.stdout.write('\u001B[?25h'); // Show cursor
    });
    
    // Render the app with adapters
    render(React.createElement(StatusTable, { 
      adapters,
      onExit: exitHandler
    }), {
      exitOnCtrlC: false  // We handle exit manually
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
    
    const runningCount = services.filter(s => s.status === 'running').length;
    const healthyCount = services.filter(s => s.health === 'healthy').length;
    
    console.log('\n' + chalk.gray(
      `${runningCount}/${services.length} services running, ` +
      `${healthyCount}/${services.length} healthy`
    ));
  }
}

async function showProductionStatus(context: CommandContext, options: any, spinner: Ora) {
  spinner.start('Checking production service status...');
  
  try {
    // Check if storage process is running
    const pidPath = join(process.cwd(), 'logs/storage-api.pid');
    
    if (!existsSync(pidPath)) {
      spinner.stop();
      console.log('\n' + chalk.bold('Service Status:'));
      console.log(chalk.gray('─'.repeat(80)));
      console.log(chalk.cyan('storage-api'.padEnd(20)) + chalk.red('stopped'.padEnd(12)));
      console.log(chalk.gray('─'.repeat(80)));
      console.log('\n' + chalk.gray('Service is not running. Start with: supastorj start'));
      return;
    }
    
    const pid = await readFile(pidPath, 'utf-8');
    const pidNum = parseInt(pid.trim());
    
    // Check if process is running
    try {
      process.kill(pidNum, 0);
      // Process exists
      
      // Try to get more info from the API
      const envPath = join(process.cwd(), '.env');
      let port = '5000';
      
      if (existsSync(envPath)) {
        const envContent = await readFile(envPath, 'utf-8');
        const match = envContent.match(/SERVER_PORT=(\d+)/);
        if (match) {
          port = match[1] || '5000';
        }
      }
      
      spinner.stop();
      
      if (options.json) {
        console.log(JSON.stringify([{
          name: 'storage-api',
          status: 'running',
          pid: pidNum,
          port: port
        }], null, 2));
      } else {
        console.log('\n' + chalk.bold('Service Status:'));
        console.log(chalk.gray('─'.repeat(80)));
        console.log(
          chalk.bold('Service'.padEnd(20)) +
          chalk.bold('Status'.padEnd(12)) +
          chalk.bold('PID'.padEnd(10)) +
          chalk.bold('Port')
        );
        console.log(chalk.gray('─'.repeat(80)));
        console.log(
          chalk.cyan('storage-api'.padEnd(20)) +
          chalk.green('running'.padEnd(12)) +
          pidNum.toString().padEnd(10) +
          port
        );
        console.log(chalk.gray('─'.repeat(80)));
        console.log('\n' + chalk.gray(`API available at: http://localhost:${port}`));
        console.log(chalk.gray('Logs: tail -f logs/storage-api.log'));
      }
    } catch (error) {
      // Process doesn't exist
      spinner.stop();
      console.log('\n' + chalk.bold('Service Status:'));
      console.log(chalk.gray('─'.repeat(80)));
      console.log(chalk.cyan('storage-api'.padEnd(20)) + chalk.red('stopped'.padEnd(12)) + chalk.gray('(stale PID file)'));
      console.log(chalk.gray('─'.repeat(80)));
      console.log('\n' + chalk.gray('Service is not running. Start with: supastorj start'));
      
      // Clean up stale PID file
      await execa('rm', ['-f', pidPath]);
    }
  } catch (error: any) {
    spinner.fail('Failed to check production status');
    context.logger.error('Error:', error.message);
  }
}