/**
 * Supastorj CLI - Main entry point
 */

import chalk from 'chalk';
import { Command } from 'commander';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { readFile } from 'fs/promises';

import { upCommand } from '../commands/up.js';
import { LoggerImpl } from '../core/logger.js';
// Import commands
import { downCommand } from '../commands/down.js';
import { logsCommand } from '../commands/logs.js';
import { EventBusImpl } from '../core/event-bus.js';
import { debugCommand } from '../commands/debug.js';
import { statusCommand } from '../commands/status.js';
import { PluginManager } from '../core/plugin-manager.js';
import { deployCommand } from '../commands/deploy/index.js';
import { ConfigManager } from '../config/config-manager.js';
import { Environment, CommandContext } from '../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Main CLI application
 */
class SupastorCLI {
  private program: Command;
  private context?: CommandContext;

  constructor() {
    this.program = new Command();
  }

  /**
   * Initialize the CLI
   */
  async initialize(): Promise<void> {
    // Load package.json for version info
    const packageJsonPath = join(__dirname, '../../package.json');
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));

    // Configure CLI
    this.program
      .name('supastorj')
      .description('Supastorj CLI - DevOps platform for Supabase Storage management')
      .version(packageJson.version)
      .option('-e, --env <environment>', 'Environment to use', Environment.Development)
      .option('-c, --config <path>', 'Path to configuration file', './supastorj.config.yaml')
      .option('--log-level <level>', 'Log level (debug, info, warn, error)', 'info')
      .option('--no-audit', 'Disable audit logging')
      .hook('preAction', async (thisCommand) => {
        // Initialize context before any command
        await this.initializeContext(thisCommand.opts());
      });

    // Add commands
    this.addCommand(deployCommand);
    this.addCommand(upCommand);
    this.addCommand(downCommand);
    this.addCommand(statusCommand);
    this.addCommand(logsCommand);
    this.addCommand(debugCommand);

    // Add global error handler
    this.program.exitOverride();
    this.program.configureOutput({
      writeErr: (str) => console.error(chalk.red(str)),
    });
  }

  /**
   * Initialize command context
   */
  private async initializeContext(options: any): Promise<void> {
    // Create logger
    const logger = new LoggerImpl({
      level: options.logLevel || 'info',
      auditLog: options.audit !== false,
    });

    // Create event bus
    const eventBus = new EventBusImpl();

    // Create config manager
    const configManager = new ConfigManager({
      configPath: options.config,
      environment: options.env,
    });

    // Try to load config (might not exist for init command)
    let config;
    try {
      config = await configManager.load();
    } catch (error) {
      // Config might not exist yet, use default
      config = ConfigManager.generateDefault();
    }

    // Create command context
    this.context = {
      config,
      environment: options.env,
      logger,
      eventBus,
    };

    // Initialize plugin manager
    const pluginManager = new PluginManager(this.context);
    await pluginManager.initialize();

    // Add plugin commands
    const pluginCommands = pluginManager.getCommands();
    for (const command of pluginCommands) {
      this.addCommand(command);
    }
  }

  /**
   * Add a command to the CLI
   */
  private addCommand(commandDef: any): void {
    const command = new Command(commandDef.name)
      .description(commandDef.description);

    // Add argument support for logs command
    if (commandDef.name === 'logs') {
      command.argument('[services...]', 'Services to show logs for');
    }

    // Add options
    if (commandDef.options) {
      for (const option of commandDef.options) {
        command.option(option.flags, option.description, option.defaultValue);
      }
    }

    // Add action
    command.action(async (...args) => {
      try {
        await commandDef.action(this.context!, ...args);
      } catch (error) {
        this.handleError(error);
      }
    });

    this.program.addCommand(command);
  }

  /**
   * Handle errors
   */
  private handleError(error: any): void {
    if (this.context?.logger) {
      this.context.logger.error('Command failed:', error);
    } else {
      console.error(chalk.red('Error:'), error.message);
    }
    process.exit(1);
  }

  /**
   * Run the CLI
   */
  async run(): Promise<void> {
    try {
      await this.initialize();
      await this.program.parseAsync(process.argv);
    } catch (error: any) {
      // Handle Commander's exitOverride errors
      if (error.code === 'commander.helpDisplayed' || error.code === 'commander.help') {
        // Normal help display, exit cleanly
        process.exit(0);
      } else if (error.code === 'commander.version') {
        // Version display, exit cleanly
        process.exit(0);
      } else {
        this.handleError(error);
      }
    }
  }
}

// Run CLI
const cli = new SupastorCLI();
cli.run().catch(console.error);