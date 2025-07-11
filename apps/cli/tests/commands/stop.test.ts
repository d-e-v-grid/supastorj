/**
 * Stop command tests
 */

import * as fs from 'fs';
import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { LoggerImpl } from '../../src/core/logger.js';
import { stopCommand } from '../../src/commands/stop.js';
import { CommandContext } from '../../src/types/index.js';
import { EventBusImpl } from '../../src/core/event-bus.js';
import { ConfigManager } from '../../src/config/config-manager.js';

vi.mock('fs');
const mockSpinner = {
  start: vi.fn().mockReturnThis(),
  stop: vi.fn(),
  succeed: vi.fn(),
  fail: vi.fn(),
  warn: vi.fn(),
  text: '',
};

vi.mock('ora', () => ({
  default: vi.fn(() => mockSpinner),
}));

// Mock execa
vi.mock('execa', () => ({
  execa: vi.fn().mockResolvedValue({
    stdout: '',
    stderr: '',
    exitCode: 0,
  }),
}));

describe('Down Command', () => {
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct command definition', () => {
    expect(stopCommand.name).toBe('down');
    expect(stopCommand.description).toContain('Stop all services');
    expect(stopCommand.options).toBeDefined();
    expect(stopCommand.options).toHaveLength(3);
  });

  it('should check for docker-compose.yml', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    
    try {
      await stopCommand.action(context, {});
    } catch (error: any) {
      expect(error.message).toBe('process.exit');
    }

    expect(context.logger.error).toHaveBeenCalledWith(
      'No docker-compose.yml found. Run "supastorj init" first.'
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should stop services with default options', async () => {
    const options = { volumes: false, removeOrphans: false };
    const { execa } = await import('execa');
    
    await stopCommand.action(context, options);

    expect(execa).toHaveBeenCalledWith(
      'docker-compose',
      expect.arrayContaining([
        '-f', expect.stringContaining('docker-compose.yml'),
        '-p', 'supastorj',
        'down'
      ]),
      { stdio: 'pipe' }
    );
  });

  it('should remove volumes with --volumes option', async () => {
    const options = { volumes: true };
    const { execa } = await import('execa');
    
    await stopCommand.action(context, options);

    expect(execa).toHaveBeenCalledWith(
      'docker-compose',
      expect.arrayContaining(['-v']),
      expect.any(Object)
    );

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Volumes have been removed')
    );
  });

  it('should remove orphans with --remove-orphans option', async () => {
    const options = { removeOrphans: true };
    const { execa } = await import('execa');
    
    await stopCommand.action(context, options);

    expect(execa).toHaveBeenCalledWith(
      'docker-compose',
      expect.arrayContaining(['--remove-orphans']),
      expect.any(Object)
    );
  });

  it('should remove images with --rmi option', async () => {
    const options = { rmi: 'all' };
    const { execa } = await import('execa');
    
    await stopCommand.action(context, options);

    expect(execa).toHaveBeenCalledWith(
      'docker-compose',
      expect.arrayContaining(['--rmi', 'all']),
      expect.any(Object)
    );

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Images have been removed (all)')
    );
  });

  it('should handle multiple options together', async () => {
    const options = {
      volumes: true,
      removeOrphans: true,
      rmi: 'local',
    };
    const { execa } = await import('execa');
    
    await stopCommand.action(context, options);

    expect(execa).toHaveBeenCalledWith(
      'docker-compose',
      expect.arrayContaining([
        '-v',
        '--remove-orphans',
        '--rmi', 'local'
      ]),
      expect.any(Object)
    );
  });

  it('should handle docker-compose errors', async () => {
    const options = {};
    const { execa } = await import('execa');
    vi.mocked(execa).mockRejectedValue(new Error('Docker not found'));
    
    try {
      await stopCommand.action(context, options);
    } catch (error: any) {
      expect(error.message).toBe('process.exit');
    }

    expect(context.logger.error).toHaveBeenCalledWith(
      'Error:',
      'Docker not found'
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should show success message', async () => {
    const options = {};
    
    await stopCommand.action(context, options);

    expect(mockSpinner.succeed).toHaveBeenCalledWith(
      'Services stopped successfully'
    );
  });

  it('should show failure message on error', async () => {
    const options = {};
    const { execa } = await import('execa');
    
    vi.mocked(execa).mockRejectedValue(new Error('Failed'));
    
    try {
      await stopCommand.action(context, options);
    } catch (error: any) {
      // Expected
    }

    expect(mockSpinner.fail).toHaveBeenCalledWith(
      'Failed to stop services'
    );
  });

  it('should use correct project name', async () => {
    const options = {};
    const { execa } = await import('execa');
    
    await stopCommand.action(context, options);

    const args = vi.mocked(execa).mock.calls[0][1];
    const projectIndex = args.indexOf('-p');
    expect(args[projectIndex + 1]).toBe('supastorj');
  });
});