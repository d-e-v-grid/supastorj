/**
 * Status command - Show service status
 */

import { CommandDefinition, CommandContext, ServiceStatus } from '../types/index.js';
import { DockerAdapter } from '../adapters/docker-adapter.js';
import { existsSync } from 'fs';
import { join } from 'path';
import ora from 'ora';
import chalk from 'chalk';
import React from 'react';
import { render, Text, Box } from 'ink';

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

      spinner.start('Checking service status...');
      
      // Load service adapters
      const adapters = await DockerAdapter.fromCompose(
        composeFile,
        'supastor',
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
            ports: info?.ports?.map(p => `${p.PublicPort}:${p.PrivatePort}`).join(', ') || '-',
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
        const StatusTable: React.FC<{ services: ServiceInfo[] }> = ({ services }) => {
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
              React.createElement(Text, { dimColor: true }, 'Press Ctrl+C to exit')
            )
          );
        };
        
        const { unmount } = render(React.createElement(StatusTable, { services }));
        
        // Update every 2 seconds
        const interval = setInterval(async () => {
          const updatedServices: ServiceInfo[] = [];
          
          for (const adapter of adapters) {
            try {
              const status = await adapter.getStatus();
              const health = await adapter.healthcheck();
              const info = await adapter.getInfo();
              
              updatedServices.push({
                name: adapter.name,
                status: status === ServiceStatus.Running ? 'running' : status,
                health: health.healthy ? 'healthy' : health.message || 'unhealthy',
                ports: info?.ports?.map(p => `${p.PublicPort}:${p.PrivatePort}`).join(', ') || '-',
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
          
          unmount();
          render(React.createElement(StatusTable, { services: updatedServices }));
        }, 2000);
        
        // Handle exit
        process.on('SIGINT', () => {
          clearInterval(interval);
          unmount();
          process.exit(0);
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