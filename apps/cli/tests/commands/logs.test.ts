/**
 * Logs command tests
 */

import * as fs from 'fs';
import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { LoggerImpl } from '../../src/core/logger.js';
import { logsCommand } from '../../src/commands/logs.js';
import { EventBusImpl } from '../../src/core/event-bus.js';
import { ConfigManager } from '../../src/config/config-manager.js';
import { DockerAdapter } from '../../src/adapters/docker-adapter.js';
import { ServiceStatus, CommandContext, Environment } from '../../src/types/index.js';

vi.mock('fs');
vi.mock('../../src/adapters/docker-adapter.js');

// Mock config manager
vi.mock('../../src/config/config-manager.js', () => ({
  ConfigManager: Object.assign(
    vi.fn().mockImplementation(() => ({
      load: vi.fn().mockResolvedValue(undefined),
      getConfig: vi.fn().mockReturnValue({
        projectName: 'test-project',
        environment: 'development',
      }),
    })),
    {
      generateDefault: vi.fn().mockReturnValue({
        projectName: 'test-project',
        environment: 'development',
        version: '1.0.0',
        initialized: true,
      }),
    }
  ),
}));

describe('Logs Command', () => {
  let context: CommandContext;
  let mockExit: any;
  let consoleLogSpy: any;
  let mockAdapter: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    context = {
      config: ConfigManager.generateDefault({
        projectName: 'test-project',
        environment: Environment.Development,
      }),
      environment: Environment.Development,
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
      await logsCommand.action(context, {});
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

    await logsCommand.action(context, { follow: false, tail: 10 });

    expect(mockAdapter.logs).toHaveBeenCalledWith({ 
      follow: false, 
      tail: 10,
      timestamps: false,
      onLog: expect.any(Function)
    });
  });

  it('should show logs for specific service', async () => {
    const mockPostgresAdapter = {
      name: 'postgres',
      type: 'postgres',
      logs: vi.fn(),
      getStatus: vi.fn().mockResolvedValue(ServiceStatus.Running),
    };
    const mockStorageAdapter = {
      name: 'storage',
      type: 'storage',
      logs: vi.fn(),
      getStatus: vi.fn().mockResolvedValue(ServiceStatus.Running),
    };
    
    vi.mocked(DockerAdapter.fromCompose).mockResolvedValue([
      mockPostgresAdapter,
      mockStorageAdapter,
    ]);

    const mockLogGenerator = async function* () {
      yield 'postgres log line';
    };
    mockPostgresAdapter.logs.mockReturnValue(mockLogGenerator());

    await logsCommand.action(context, { follow: false, tail: 10 }, ['postgres']);

    expect(mockPostgresAdapter.logs).toHaveBeenCalled();
    expect(mockStorageAdapter.logs).not.toHaveBeenCalled();
  });

  it('should follow logs with --follow option', async () => {
    const mockLogGenerator = async function* () {
      yield 'log line 1';
      yield 'log line 2';
    };
    mockAdapter.logs.mockReturnValue(mockLogGenerator());

    await logsCommand.action(context, { follow: true, tail: 10 });

    expect(mockAdapter.logs).toHaveBeenCalledWith({ 
      follow: true, 
      tail: 10,
      timestamps: false,
      onLog: expect.any(Function)
    });
  });

  it('should show timestamps with --timestamps option', async () => {
    const mockLogGenerator = async function* () {
      yield '2024-01-01T12:00:00.000Z log line';
    };
    mockAdapter.logs.mockReturnValue(mockLogGenerator());

    await logsCommand.action(context, { follow: false, tail: 10, timestamps: true });

    expect(mockAdapter.logs).toHaveBeenCalledWith({ 
      follow: false, 
      tail: 10,
      timestamps: true,
      onLog: expect.any(Function)
    });
  });

  it('should limit log lines with --tail option', async () => {
    const mockLogGenerator = async function* () {
      yield 'log line';
    };
    mockAdapter.logs.mockReturnValue(mockLogGenerator());

    await logsCommand.action(context, { follow: false, tail: 50 });

    expect(mockAdapter.logs).toHaveBeenCalledWith({ 
      follow: false, 
      tail: 50,
      timestamps: false,
      onLog: expect.any(Function)
    });
  });

  it('should handle service not found', async () => {
    vi.mocked(DockerAdapter.fromCompose).mockResolvedValue([mockAdapter]);

    try {
      await logsCommand.action(context, { follow: false }, ['nonexistent']);
    } catch (error: any) {
      expect(error.message).toBe('process.exit');
    }

    expect(context.logger.error).toHaveBeenCalledWith(
      'Service not found: nonexistent'
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should handle multiple services', async () => {
    const mockPostgresAdapter = {
      name: 'postgres',
      type: 'postgres',
      logs: vi.fn(),
      getStatus: vi.fn().mockResolvedValue(ServiceStatus.Running),
    };
    const mockStorageAdapter = {
      name: 'storage',
      type: 'storage',
      logs: vi.fn(),
      getStatus: vi.fn().mockResolvedValue(ServiceStatus.Running),
    };
    
    vi.mocked(DockerAdapter.fromCompose).mockResolvedValue([
      mockPostgresAdapter,
      mockStorageAdapter,
    ]);

    const mockLogGenerator1 = async function* () {
      yield 'postgres log';
    };
    const mockLogGenerator2 = async function* () {
      yield 'storage log';
    };
    mockPostgresAdapter.logs.mockReturnValue(mockLogGenerator1());
    mockStorageAdapter.logs.mockReturnValue(mockLogGenerator2());

    await logsCommand.action(context, { follow: false }, ['postgres', 'storage']);

    expect(mockPostgresAdapter.logs).toHaveBeenCalled();
    expect(mockStorageAdapter.logs).toHaveBeenCalled();
  });

  it('should handle log stream errors', async () => {
    const mockLogGenerator = async function* () {
      yield 'first log';
      throw new Error('Stream error');
    };
    mockAdapter.logs.mockReturnValue(mockLogGenerator());

    // The command should handle errors gracefully and continue
    await logsCommand.action(context, { follow: false });

    expect(context.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error reading logs'),
      expect.objectContaining({ service: 'postgres' })
    );
  });
});