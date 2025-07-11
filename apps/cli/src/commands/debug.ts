/**
 * Debug command - Debug container issues
 */

import { join } from 'path';
import { $, chalk } from 'zx';
import { existsSync } from 'fs';

import { DockerAdapter } from '../adapters/docker-adapter.js';
import { CommandContext, CommandDefinition } from '../types/index.js';

export const debugCommand: CommandDefinition = {
  name: 'debug',
  description: 'Debug container issues',
  options: [
    {
      flags: '-s, --service <name>',
      description: 'Service name to debug',
    },
  ],
  action: async (context: CommandContext, options: any) => {
    try {
      // Check if project is initialized
      const composeFile = join(process.cwd(), 'docker-compose.yml');
      if (!existsSync(composeFile)) {
        context.logger.error('No docker-compose.yml found. Run "supastorj init" first.');
        process.exit(1);
      }

      const adapters = await DockerAdapter.fromCompose(
        composeFile,
        'supastorj',
        context.logger
      );

      if (options.service) {
        // Debug specific service
        const adapter = adapters.find(a => a.name === options.service);
        if (!adapter) {
          context.logger.error(`Service ${options.service} not found`);
          process.exit(1);
        }

        console.log(chalk.bold(`\nDebugging ${options.service}:\n`));

        // Get container info
        const info = await adapter.getInfo();
        if (!info) {
          console.log(chalk.red('Container not found or not running'));
          return;
        }

        console.log(chalk.cyan('Container Info:'));
        console.log(`  ID: ${info.id.substring(0, 12)}`);
        console.log(`  Status: ${info.status}`);
        console.log(`  Image: ${info.image}`);
        console.log(`  Created: ${new Date(info.created).toLocaleString()}`);

        // Get health status
        const health = await adapter.healthcheck();
        console.log(chalk.cyan('\nHealth Status:'));
        console.log(`  Healthy: ${health.healthy ? chalk.green('Yes') : chalk.red('No')}`);
        console.log(`  Message: ${health.message}`);

        if (health.details?.['log']) {
          console.log(chalk.cyan('\nHealth Check Log:'));
          for (const entry of health.details['log'].slice(-5)) {
            console.log(`  ${new Date(entry.Start).toLocaleTimeString()}: ${entry.Output.trim()}`);
          }
        }

        // Check for common configuration issues
        if (adapter.name === 'postgres' || adapter.name === 'storage' || adapter.name === 'postgres-meta') {
          console.log(chalk.cyan('\nConfiguration Check:'));

          try {
            // Configure zx to not print commands and capture output
            $.verbose = false;
            const result = await $`docker inspect supastorj-${adapter.name}-1 --format '{{json .Config.Env}}'`;
            const stdout = result.stdout;

            const envVars = JSON.parse(stdout) as string[];

            // Check for password consistency
            const passwords = new Map<string, string>();
            const passwordVars = ['POSTGRES_PASSWORD', 'PG_META_DB_PASSWORD'];

            for (const env of envVars) {
              const parts = env.split('=');
              if (parts.length < 2) continue;

              const key = parts[0];
              const value = parts.slice(1).join('='); // Handle values with = in them

              if (key && passwordVars.includes(key) && value) {
                passwords.set(key, value);
              }

              // Check DATABASE_URL for password
              if (key === 'DATABASE_URL' && value && value.includes('postgresql://')) {
                const match = value.match(/postgresql:\/\/[^:]+:([^@]+)@/);
                if (match && match[1]) {
                  passwords.set('DATABASE_URL_PASSWORD', match[1]);
                }
              }
            }

            // Compare passwords
            const uniquePasswords = new Set(passwords.values());
            if (uniquePasswords.size > 1) {
              console.log(chalk.red('  ⚠️  Password mismatch detected!'));
              for (const [key, value] of passwords) {
                console.log(`    ${key}: ${value.substring(0, 3)}***`);
              }
              console.log(chalk.yellow('  Ensure all services use the same PostgreSQL password.'));
            } else {
              console.log(chalk.green('  ✓ Password configuration is consistent'));
            }

            // Check required environment variables
            const requiredVars = {
              'postgres': ['POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB'],
              'storage': ['DATABASE_URL', 'JWT_SECRET', 'ANON_KEY', 'SERVICE_KEY'],
              'postgres-meta': ['PG_META_DB_HOST', 'PG_META_DB_USER', 'PG_META_DB_PASSWORD'],
            };

            if (requiredVars[adapter.name]) {
              console.log(chalk.cyan('\n  Required Environment Variables:'));
              for (const reqVar of requiredVars[adapter.name]) {
                const found = envVars.find(e => e.startsWith(`${reqVar}=`));
                if (found) {
                  console.log(`    ${chalk.green('✓')} ${reqVar}`);
                } else {
                  console.log(`    ${chalk.red('✗')} ${reqVar} - NOT SET`);
                }
              }
            }
          } catch (error) {
            console.log(chalk.yellow('  Could not inspect container environment'));
          }
        }

        // Get recent logs
        console.log(chalk.cyan('\nRecent Logs:'));
        const logs = adapter.logs({ tail: 50 });
        for await (const line of logs) {
          console.log(`  ${line}`);
        }
      } else {
        // Debug all services
        console.log(chalk.bold('\nService Status:\n'));
        for (const adapter of adapters) {
          const status = await adapter.getStatus();
          const health = await adapter.healthcheck();

          console.log(chalk.cyan(`${adapter.name}:`));
          console.log(`  Status: ${status}`);
          console.log(`  Health: ${health.healthy ? chalk.green('Healthy') : chalk.red(health.message)}`);

          if (!health.healthy && health.details?.['log']) {
            console.log('  Recent health checks:');
            for (const entry of health.details['log'].slice(-3)) {
              console.log(`    ${entry.Output.trim()}`);
            }
          }
          console.log();
        }
      }
    } catch (error: any) {
      context.logger.error('Debug failed:', error.message);
      process.exit(1);
    }
  },
};