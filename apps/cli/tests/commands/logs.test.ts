/**
 * Logs command tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logsCommand } from '../../src/commands/logs.js';
import { CommandContext, ServiceStatus, ServiceAdapter } from '../../src/types/index.js';
import { EventBusImpl } from '../../src/core/event-bus.js';
import { LoggerImpl } from '../../src/core/logger.js';
import { ConfigManager } from '../../src/config/config-manager.js';
import { DockerAdapter } from '../../src/adapters/docker-adapter.js';
import * as fs from 'fs';

vi.mock('fs');
vi.mock('../../src/adapters/docker-adapter.js');

describe('Logs Command', () => {
  let context: CommandContext;
  let mockExit: any;
  let consoleLogSpy: any;
  let mockAdapter: any;

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
    mockAdapter = {
      name: 'postgres',
      type: 'postgres',
      logs: vi.fn(),
      getStatus: vi.fn().mockResolvedValue(ServiceStatus.Running),
    };
    vi.mocked(DockerAdapter.fromCompose).mockResolvedValue([mockAdapter]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct command definition', () => {
    expect(logsCommand.name).toBe('logs');
    expect(logsCommand.description).toContain('View service logs');
    expect(logsCommand.options).toBeDefined();
    expect(logsCommand.options).toHaveLength(3);
  });

  it('should check for docker-compose.yml', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    
    try {
      await logsCommand.action(context, [], {});
    } catch (error: any) {
      expect(error.message).toBe('process.exit');
    }

    expect(context.logger.error).toHaveBeenCalledWith(
      'No docker-compose.yml found. Run "supastorj init" first.'
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should show logs for all services when no service specified', async () => {
    const mockLogGenerator = async function* () {
      yield '2024-01-01 12:00:00 [INFO] Service started';
      yield '2024-01-01 12:00:01 [INFO] Ready to accept connections';
    };
    mockAdapter.logs.mockReturnValue(mockLogGenerator());

    await logsCommand.action(context, [], { follow: false, tail: 10 });

    expect(mockAdapter.logs).toHaveBeenCalledWith({ follow: false, tail: 10 });
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('[postgres]')
    );
  });

  it('should show logs for specific service', async () => {
    const mockLogGenerator = async function* () {
      yield '2024-01-01 12:00:00 [INFO] Service started';
    };
    mockAdapter.logs.mockReturnValue(mockLogGenerator());

    await logsCommand.action(context, ['postgres'], { follow: false });

    expect(mockAdapter.logs).toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('[postgres]')
    );
  });

  it('should follow logs with --follow option', async () => {
    const mockLogGenerator = async function* () {
      yield '2024-01-01 12:00:00 [INFO] Log line 1';
      yield '2024-01-01 12:00:01 [INFO] Log line 2';
    };
    mockAdapter.logs.mockReturnValue(mockLogGenerator());

    await logsCommand.action(context, ['postgres'], { follow: true });

    expect(mockAdapter.logs).toHaveBeenCalledWith({ follow: true, tail: 100 });
  });

  it('should show timestamps with --timestamps option', async () => {
    const mockLogGenerator = async function* () {
      yield '2024-01-01T12:00:00.000Z Container log message';
    };
    mockAdapter.logs.mockReturnValue(mockLogGenerator());

    await logsCommand.action(context, ['postgres'], { timestamps: true });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('2024-01-01T12:00:00.000Z')
    );
  });

  it('should limit log lines with --tail option', async () => {
    const mockLogGenerator = async function* () {
      yield 'Log line 1';
      yield 'Log line 2';
      yield 'Log line 3';
    };
    mockAdapter.logs.mockReturnValue(mockLogGenerator());

    await logsCommand.action(context, ['postgres'], { tail: 5 });

    expect(mockAdapter.logs).toHaveBeenCalledWith({ follow: undefined, tail: 5 });
  });

  it('should handle service not found', async () => {
    await logsCommand.action(context, ['nonexistent'], {});

    expect(context.logger.warn).toHaveBeenCalledWith(
      'Service not found: nonexistent'
    );
  });

  it('should handle multiple services', async () => {
    const postgresAdapter = {
      name: 'postgres',
      type: 'postgres',
      logs: vi.fn().mockReturnValue((async function* () {
        yield 'Postgres log';
      })()),
      getStatus: vi.fn().mockResolvedValue(ServiceStatus.Running),
    };
    
    const storageAdapter = {
      name: 'storage',
      type: 'storage', 
      logs: vi.fn().mockReturnValue((async function* () {
        yield 'Storage log';
      })()),
      getStatus: vi.fn().mockResolvedValue(ServiceStatus.Running),
    };

    vi.mocked(DockerAdapter.fromCompose).mockResolvedValue([
      postgresAdapter,
      storageAdapter,
    ]);

    await logsCommand.action(context, ['postgres', 'storage'], {});

    expect(postgresAdapter.logs).toHaveBeenCalled();
    expect(storageAdapter.logs).toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('[postgres]')
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('[storage]')
    );
  });

  it('should handle log stream errors', async () => {
    const mockLogGenerator = async function* () {
      yield 'First log line';
      throw new Error('Stream error');
    };
    mockAdapter.logs.mockReturnValue(mockLogGenerator());

    await logsCommand.action(context, ['postgres'], {});

    expect(context.logger.error).toHaveBeenCalledWith(
      'Error streaming logs for postgres:',
      expect.any(Error)
    );
  });
});