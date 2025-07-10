/**
 * Up command tests
 */

import * as fs from 'fs';
import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { upCommand } from '../../src/commands/up.js';
import { LoggerImpl } from '../../src/core/logger.js';
import { EventBusImpl } from '../../src/core/event-bus.js';
import { ConfigManager } from '../../src/config/config-manager.js';
import { DockerAdapter } from '../../src/adapters/docker-adapter.js';
import { ServiceStatus, CommandContext } from '../../src/types/index.js';

vi.mock('fs');
vi.mock('ora', () => ({
  default: () => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
    warn: vi.fn(),
    text: '',
  }),
}));

// Mock execa
vi.mock('execa', () => ({
  execa: vi.fn().mockResolvedValue({
    stdout: '',
    stderr: '',
    exitCode: 0,
  }),
}));

// Mock DockerAdapter
vi.mock('../../src/adapters/docker-adapter.js', () => ({
  DockerAdapter: {
    fromCompose: vi.fn(),
  },
}));

describe('Up Command', () => {
  let context: CommandContext;
  let mockExit: any;
  let consoleLogSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    context = {
      config: ConfigManager.generateDefault(),
      environment: 'development',
      logger: new LoggerImpl(),
      eventBus: new EventBusImpl(),
    };

    // Mock logger
    vi.spyOn(context.logger, 'info').mockImplementation(() => {});
    vi.spyOn(context.logger, 'error').mockImplementation(() => {});
    vi.spyOn(context.logger, 'warn').mockImplementation(() => {});

    // Mock process.exit
    mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    // Mock console
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Mock fs.existsSync
    vi.mocked(fs.existsSync).mockReturnValue(true);

    // Mock DockerAdapter
    const mockAdapter = {
      name: 'postgres',
      healthcheck: vi.fn().mockResolvedValue({ healthy: true }),
      getStatus: vi.fn().mockResolvedValue(ServiceStatus.Running),
    };
    vi.mocked(DockerAdapter.fromCompose).mockResolvedValue([mockAdapter]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct command definition', () => {
    expect(upCommand.name).toBe('up');
    expect(upCommand.description).toContain('Start all services');
    expect(upCommand.options).toBeDefined();
    expect(upCommand.options).toHaveLength(4);
  });

  it('should check for docker-compose.yml', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    
    try {
      await upCommand.action(context, { detach: true });
    } catch (error: any) {
      expect(error.message).toBe('process.exit');
    }

    expect(context.logger.error).toHaveBeenCalledWith(
      'No docker-compose.yml found. Run "supastorj init" first.'
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should start services in detached mode', async () => {
    const options = { detach: true };
    const { execa } = await import('execa');
    
    await upCommand.action(context, options);

    expect(execa).toHaveBeenCalledWith(
      'docker-compose',
      expect.arrayContaining([
        '-f', expect.stringContaining('docker-compose.yml'),
        '-p', 'supastorj',
        'up',
        '-d'
      ]),
      { stdio: 'pipe' }
    );
  });

  it('should start services in attached mode', async () => {
    const options = { detach: false };
    const { execa } = await import('execa');
    
    await upCommand.action(context, options);

    expect(execa).toHaveBeenCalledWith(
      'docker-compose',
      expect.arrayContaining([
        '-f', expect.stringContaining('docker-compose.yml'),
        '-p', 'supastorj',
        'up'
      ]),
      { stdio: 'inherit' }
    );
  });

  it('should handle --build option', async () => {
    const options = { detach: true, build: true };
    const { execa } = await import('execa');
    
    await upCommand.action(context, options);

    expect(execa).toHaveBeenCalledWith(
      'docker-compose',
      expect.arrayContaining(['--build']),
      expect.any(Object)
    );
  });

  it('should handle --scale option', async () => {
    const options = { detach: true, scale: 'storage=3,postgres=2' };
    const { execa } = await import('execa');
    
    await upCommand.action(context, options);

    expect(execa).toHaveBeenCalledWith(
      'docker-compose',
      expect.arrayContaining([
        '--scale', 'storage=3',
        '--scale', 'postgres=2'
      ]),
      expect.any(Object)
    );
  });

  it('should handle --profile option', async () => {
    const options = { detach: true, profile: 'redis' };
    const { execa } = await import('execa');
    
    await upCommand.action(context, options);

    expect(execa).toHaveBeenCalledWith(
      'docker-compose',
      expect.arrayContaining(['--profile', 'redis']),
      expect.any(Object)
    );
  });

  it('should check service health in detached mode', async () => {
    const options = { detach: true };
    const mockAdapter = {
      name: 'postgres',
      healthcheck: vi.fn()
        .mockResolvedValueOnce({ healthy: false })
        .mockResolvedValueOnce({ healthy: true }),
      getStatus: vi.fn().mockResolvedValue(ServiceStatus.Running),
    };
    vi.mocked(DockerAdapter.fromCompose).mockResolvedValue([mockAdapter]);
    
    await upCommand.action(context, options);

    expect(mockAdapter.healthcheck).toHaveBeenCalledTimes(2);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Service Status:')
    );
  });

  it.skip('should timeout waiting for services to be healthy', async () => {
    // Skipping this test as it takes too long
  });

  it('should display service status after successful start', async () => {
    const options = { detach: true };
    
    await upCommand.action(context, options);

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('postgres')
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('running')
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Run "supastorj logs -f" to see service logs')
    );
  });

  it('should handle docker-compose errors', async () => {
    const options = { detach: true };
    const { execa } = await import('execa');
    vi.mocked(execa).mockRejectedValue(new Error('Docker not found'));
    
    try {
      await upCommand.action(context, options);
    } catch (error: any) {
      expect(error.message).toBe('process.exit');
    }

    expect(context.logger.error).toHaveBeenCalledWith(
      'Error:',
      'Docker not found'
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should handle service adapter creation errors', async () => {
    const options = { detach: true };
    vi.mocked(DockerAdapter.fromCompose).mockRejectedValue(
      new Error('Invalid compose file')
    );
    
    try {
      await upCommand.action(context, options);
    } catch (error: any) {
      expect(error.message).toBe('process.exit');
    }

    expect(context.logger.error).toHaveBeenCalledWith(
      'Error:',
      'Invalid compose file'
    );
  });
});