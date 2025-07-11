/**
 * Supastorj CLI - Main entry point
 */
import { chalk } from 'zx';
import { Command } from 'commander';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { readFile } from 'fs/promises';

import { LoggerImpl } from '../core/logger.js';
import { stopCommand } from '../commands/stop.js';
import { logsCommand } from '../commands/logs.js';
import { startCommand } from '../commands/start.js';
import { debugCommand } from '../commands/debug.js';
import { EventBusImpl } from '../core/event-bus.js';
import { statusCommand } from '../commands/status.js';
// Import commands
import { initCommand } from '../commands/init/index.js';
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
      .option('-c, --config <path>', 'Path to project directory', process.cwd())
      .option('--log-level <level>', 'Log level (debug, info, warn, error)', 'info')
      .option('--no-audit', 'Disable audit logging')
      .hook('preAction', async (thisCommand) => {
        // Initialize context before any command
        await this.initializeContext(thisCommand.opts());
      });

    // Add commands
    this.addCommand(initCommand);
    this.addCommand(startCommand);
    this.addCommand(stopCommand);
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
      projectPath: options.config,
      environment: options.env,
    });

    // Try to load config (might not exist for init command)
    let config;
    try {
      config = await configManager.load();
    } catch (error) {
      // Config might not exist yet, use default
      config = ConfigManager.generateDefault({});
    }

    // Create command context
    this.context = {
      config,
      environment: options.env,
      logger,
      eventBus,
    };

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
        // For commands with variadic arguments, the last arg is always options
        if (commandDef.name === 'logs') {
          // Commander passes [services, command] when variadic args are present
          // where 'command' is the Command object that contains options
          if (args.length === 0) {
            // No arguments at all - shouldn't happen
            await commandDef.action(this.context!, {}, undefined);
          } else if (args.length === 1) {
            // Only command object (no services specified)
            const cmdObj = args[0];
            const options = cmdObj.opts ? cmdObj.opts() : cmdObj;
            await commandDef.action(this.context!, options, undefined);
          } else {
            // Services and command object
            const services = args[0];
            const cmdObj = args[args.length - 1];
            const options = cmdObj.opts ? cmdObj.opts() : cmdObj;
            await commandDef.action(this.context!, options, services);
          }
        } else {
          await commandDef.action(this.context!, ...args);
        }
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