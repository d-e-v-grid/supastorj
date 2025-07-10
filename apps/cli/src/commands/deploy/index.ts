/**
 * Deploy command - Deploy Supastorj in dev or production mode
 */

import chalk from 'chalk';
import { join } from 'path';
import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { select } from '@clack/prompts';

import { CommandContext, CommandDefinition } from '../../types/index.js';
import { DevDeployOptions, deployDevEnvironment } from './dev-environment.js';
import { ProdDeployOptions, deployProdEnvironment } from './prod-environment.js';

export const deployCommand: CommandDefinition = {
  name: 'deploy',
  description: 'Deploy Supastorj environment (dev with Docker or production on bare metal)',
  options: [
    {
      flags: '--mode <mode>',
      description: 'Deployment mode: dev (Docker) or prod (bare metal)',
      defaultValue: 'unknown',
    },
    {
      flags: '-f, --force',
      description: 'Overwrite existing configuration',
      defaultValue: false,
    },
    {
      flags: '-y, --yes',
      description: 'Skip prompts and use default values',
      defaultValue: false,
    },
    {
      flags: '--skip-env',
      description: 'Skip .env file generation',
      defaultValue: false,
    },
    {
      flags: '--no-image-transform',
      description: 'Disable image transformation service',
      defaultValue: false,
    },
    {
      flags: '--skip-deps',
      description: 'Skip dependency installation (prod mode only)',
      defaultValue: false,
    },
    {
      flags: '--services <services>',
      description: 'Comma-separated list of services to deploy (prod mode only)',
    },
    {
      flags: '--dry-run',
      description: 'Show what would be done without making changes (prod mode only)',
      defaultValue: false,
    },
  ],
  action: async (context: CommandContext, options: any) => {
    try {
      // Determine deployment mode
      let mode = options.mode;
      
      // If mode is not explicitly set, ask the user
      if (!options.yes && !['dev', 'prod'].includes(mode)) {
        mode = await select({
          message: 'Select deployment mode:',
          options: [
            { value: 'dev', label: 'Development (Docker Compose)' },
            { value: 'prod', label: 'Production (Bare Metal)' },
          ],
        }) as string;
      }

      // Validate mode
      if (!['dev', 'prod'].includes(mode)) {
        context.logger.error(`Invalid mode: ${mode}. Use 'dev' or 'prod'.`);
        process.exit(1);
      }

      console.log(chalk.cyan(`\n🚀 Deploying in ${mode.toUpperCase()} mode\n`));

      if (mode === 'dev') {
        // Development mode - Docker Compose deployment
        const devOptions: DevDeployOptions = {
          force: options.force,
          yes: options.yes,
          skipEnv: options.skipEnv,
          noImageTransform: options.noImageTransform,
        };

        await deployDevEnvironment(context, devOptions);
      } else {
        // Production mode - Bare metal deployment
        // Check for .env file
        const envPath = join(process.cwd(), '.env');
        if (!existsSync(envPath)) {
          context.logger.error('No .env file found. Run "supastorj deploy --mode dev" first to generate configuration.');
          process.exit(1);
        }

        // Load environment variables
        const envContent = await readFile(envPath, 'utf-8');
        const envVars = dotenv.parse(envContent);

        const prodOptions: ProdDeployOptions = {
          skipDeps: options.skipDeps,
          services: options.services,
          dryRun: options.dryRun,
        };

        await deployProdEnvironment(context, prodOptions, envVars);
      }

      // Log audit event
      context.logger.audit('deployment_completed', {
        mode,
        options,
      });

    } catch (error: any) {
      context.logger.error('Deployment failed:', error.message);
      process.exit(1);
    }
  },
};