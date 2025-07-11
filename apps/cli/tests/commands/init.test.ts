/**
 * Init command tests
 */

import * as fs from 'fs/promises';
import * as prompts from '@clack/prompts';
import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { LoggerImpl } from '../../src/core/logger.js';
import { initCommand } from '../../src/commands/init/index.js';
import { CommandContext } from '../../src/types/index.js';
import { EventBusImpl } from '../../src/core/event-bus.js';
import { ConfigManager } from '../../src/config/config-manager.js';

vi.mock('fs/promises');
vi.mock('@clack/prompts');

// Mock zx
vi.mock('zx', () => ({
  $: vi.fn(),
  fs: {
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    copyFile: vi.fn(),
    pathExists: vi.fn().mockResolvedValue(false),
  },
  chalk: {
    cyan: (text: string) => text,
    green: (text: string) => text,
    yellow: (text: string) => text,
    dim: (text: string) => text,
  },
}));

// Mock child process functions
vi.mock('../../src/commands/init/dev-environment.js', () => ({
  deployDevEnvironment: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/commands/init/prod-environment.js', () => ({
  deployProdEnvironment: vi.fn().mockResolvedValue(undefined),
}));

describe('Init Command', () => {
  let context: CommandContext;
  let consoleLogSpy: any;
  let mockExit: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    context = {
      config: ConfigManager.generateDefault(),
      environment: 'development',
      logger: new LoggerImpl(),
      eventBus: new EventBusImpl(),
    };

    // Mock logger methods
    vi.spyOn(context.logger, 'info').mockImplementation(() => {});
    vi.spyOn(context.logger, 'error').mockImplementation(() => {});
    vi.spyOn(context.logger, 'debug').mockImplementation(() => {});
    vi.spyOn(context.logger, 'warn').mockImplementation(() => {});
    vi.spyOn(context.logger, 'audit').mockImplementation(() => {});

    // Mock console
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Mock process.exit
    mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    // Mock file operations
    vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.copyFile).mockResolvedValue(undefined);

    // Mock prompts
    vi.mocked(prompts.intro).mockImplementation(() => {});
    vi.mocked(prompts.outro).mockImplementation(() => {});
    vi.mocked(prompts.text).mockResolvedValue('supastorj');
    vi.mocked(prompts.select).mockResolvedValue('dev');
    vi.mocked(prompts.confirm).mockResolvedValue(true);
    vi.mocked(prompts.spinner).mockReturnValue({
      start: vi.fn(),
      stop: vi.fn(),
      message: '',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct command definition', () => {
    expect(initCommand.name).toBe('init');
    expect(initCommand.description).toContain('Initialize');
    expect(initCommand.options).toHaveLength(8);
  });

  it('should initialize a dev project with mode flag', async () => {
    const options = { mode: 'dev', force: false, yes: true };
    const { deployDevEnvironment } = await import('../../src/commands/init/dev-environment.js');
    
    await initCommand.action(context, options);

    expect(deployDevEnvironment).toHaveBeenCalledWith(
      context,
      {
        force: false,
        yes: true,
        skipEnv: undefined,
        noImageTransform: undefined,
        projectName: 'supastorj',
      }
    );
  });

  it('should initialize a prod project with mode flag', async () => {
    const options = { mode: 'prod', force: false, yes: true };
    const { deployProdEnvironment } = await import('../../src/commands/init/prod-environment.js');
    
    await initCommand.action(context, options);

    expect(deployProdEnvironment).toHaveBeenCalledWith(
      context,
      {
        force: false,
        yes: true,
        skipEnv: undefined,
        skipDeps: undefined,
        projectName: 'supastorj',
        services: undefined,
        dryRun: undefined,
      }
    );
  });

  it('should prompt for mode when not specified', async () => {
    const options = { mode: 'unknown', force: false, yes: false };
    vi.mocked(prompts.select).mockResolvedValue('dev');
    const { deployDevEnvironment } = await import('../../src/commands/init/dev-environment.js');
    
    await initCommand.action(context, options);

    expect(prompts.select).toHaveBeenCalledWith({
      message: 'Select project mode:',
      options: [
        { value: 'dev', label: 'Development (Docker Compose)' },
        { value: 'prod', label: 'Production (Bare Metal)' },
      ],
    });
    expect(deployDevEnvironment).toHaveBeenCalled();
  });

  it('should handle --no-image-transform option for dev mode', async () => {
    const options = { mode: 'dev', force: false, yes: true, noImageTransform: true };
    const { deployDevEnvironment } = await import('../../src/commands/init/dev-environment.js');
    
    await initCommand.action(context, options);

    expect(deployDevEnvironment).toHaveBeenCalledWith(
      context,
      {
        force: false,
        yes: true,
        skipEnv: undefined,
        noImageTransform: true,
        projectName: 'supastorj',
      }
    );
  });

  it('should handle --skip-env option', async () => {
    const options = { mode: 'dev', force: false, yes: true, skipEnv: true };
    const { deployDevEnvironment } = await import('../../src/commands/init/dev-environment.js');
    
    await initCommand.action(context, options);

    expect(deployDevEnvironment).toHaveBeenCalledWith(
      context,
      expect.objectContaining({
        skipEnv: true,
      })
    );
  });

  it('should handle --skip-deps option for prod mode', async () => {
    const options = { mode: 'prod', force: false, yes: true, skipDeps: true };
    const { deployProdEnvironment } = await import('../../src/commands/init/prod-environment.js');
    
    await initCommand.action(context, options);

    expect(deployProdEnvironment).toHaveBeenCalledWith(
      context,
      expect.objectContaining({
        skipDeps: true,
      })
    );
  });

  it('should handle --services option for prod mode', async () => {
    const options = { mode: 'prod', force: false, yes: true, services: 'postgres,storage' };
    const { deployProdEnvironment } = await import('../../src/commands/init/prod-environment.js');
    
    await initCommand.action(context, options);

    expect(deployProdEnvironment).toHaveBeenCalledWith(
      context,
      {
        force: false,
        yes: true,
        skipEnv: undefined,
        skipDeps: undefined,
        projectName: 'supastorj',
        services: 'postgres,storage',
        dryRun: undefined,
      }
    );
  });

  it('should handle --dry-run option', async () => {
    const options = { mode: 'dev', force: false, yes: true, dryRun: true };
    const { deployDevEnvironment } = await import('../../src/commands/init/dev-environment.js');
    
    await initCommand.action(context, options);

    expect(deployDevEnvironment).toHaveBeenCalledWith(
      context,
      {
        force: false,
        yes: true,
        skipEnv: undefined,
        noImageTransform: undefined,
        projectName: 'supastorj',
      }
    );
  });


  it('should handle errors during initialization', async () => {
    const options = { mode: 'dev', force: false, yes: true };
    const { deployDevEnvironment } = await import('../../src/commands/init/dev-environment.js');
    vi.mocked(deployDevEnvironment).mockRejectedValue(new Error('Deployment failed'));
    
    try {
      await initCommand.action(context, options);
    } catch (error: any) {
      expect(error.message).toBe('process.exit');
    }

    expect(context.logger.error).toHaveBeenCalledWith('Initialization failed:', 'Deployment failed');
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});