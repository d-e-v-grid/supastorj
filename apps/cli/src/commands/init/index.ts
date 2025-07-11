/**
 * Init command - Initialize Supastorj project in dev or production mode
 */
import { chalk } from 'zx';
import { text, select } from '@clack/prompts';

import { CommandContext, CommandDefinition } from '../../types/index.js';
import { DevDeployOptions, deployDevEnvironment } from './dev-environment.js';
import { ProdDeployOptions, deployProdEnvironment } from './prod-environment.js';

export const initCommand: CommandDefinition = {
  name: 'init',
  description: 'Initialize Supastorj project (dev with Docker or production on bare metal)',
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
      // Determine initialization mode
      let mode = options.mode;

      // First, always ask for project name unless in yes mode
      let projectName = 'supastorj';
      if (!options.yes) {
        projectName = await text({
          message: 'Project name:',
          placeholder: 'supastorj',
          defaultValue: 'supastorj',
        }) as string;
      }

      // If mode is not explicitly set, ask the user
      if (!options.yes && !['dev', 'prod'].includes(mode)) {
        mode = await select({
          message: 'Select project mode:',
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

      console.log(chalk.cyan(`\n🚀 Initializing project in ${mode.toUpperCase()} mode\n`));

      if (mode === 'dev') {
        // Development mode - Docker Compose deployment
        const devOptions: DevDeployOptions = {
          force: options.force,
          yes: options.yes,
          skipEnv: options.skipEnv,
          noImageTransform: options.noImageTransform,
          projectName,
        };

        await deployDevEnvironment(context, devOptions);
      } else {
        // Production mode - Bare metal deployment
        const prodOptions: ProdDeployOptions = {
          skipDeps: options.skipDeps,
          services: options.services,
          dryRun: options.dryRun,
          force: options.force,
          yes: options.yes,
          skipEnv: options.skipEnv,
          projectName,
        };

        await deployProdEnvironment(context, prodOptions);
      }

      // Log audit event
      context.logger.audit('project_initialized', {
        mode,
        options,
      });

    } catch (error: any) {
      context.logger.error('Initialization failed:', error.message);
      process.exit(1);
    }
  },
};