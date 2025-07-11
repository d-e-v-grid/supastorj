/**
 * Start command tests
 */

import { join } from 'path';
import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { startCommand } from '../../src/commands/start.js';
import { LoggerImpl } from '../../src/core/logger.js';
import { EventBusImpl } from '../../src/core/event-bus.js';
import { ConfigManager } from '../../src/config/config-manager.js';
import { CommandContext, Environment, DeploymentMode, StorageBackendType } from '../../src/types/index.js';

// Mock zx
vi.mock('zx', () => ({
  $: Object.assign(
    vi.fn().mockImplementation((strings: TemplateStringsArray, ...values: any[]) => {
      const cmd = strings.reduce((acc, str, i) => {
        return acc + str + (values[i] || '');
      }, '');
      
      // Mock different commands
      if (cmd.includes('docker compose version')) {
        return Promise.resolve({ stdout: 'Docker Compose version v2.0.0' });
      }
      if (cmd.includes('sleep')) {
        return Promise.resolve({});
      }
      
      // Default response
      return Promise.resolve({
        stdout: '',
        stderr: '',
        exitCode: 0,
        pipe: vi.fn().mockReturnThis(),
      });
    }),
    { verbose: false }
  ),
  fs: {
    pathExists: vi.fn().mockResolvedValue(true),
    readFile: vi.fn().mockResolvedValue(''),
    writeFile: vi.fn().mockResolvedValue(undefined),
    ensureDir: vi.fn().mockResolvedValue(undefined),
  },
  chalk: {
    cyan: (text: string) => text,
    green: (text: string) => text,
  },
}));

// Mock net module
vi.mock('net', () => ({
  createServer: vi.fn().mockReturnValue({
    once: vi.fn((event, callback) => {
      if (event === 'listening') {
        callback();
      }
    }),
    close: vi.fn(),
    listen: vi.fn(),
  }),
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  access: vi.fn(),
  mkdir: vi.fn(),
}));

describe('Start Command', () => {
  let context: CommandContext;
  let mockExit: any;
  let mockConfigManager: any;

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

    // Mock ConfigManager
    mockConfigManager = {
      isInitialized: vi.fn().mockResolvedValue(true),
      load: vi.fn().mockResolvedValue(context.config),
      isServiceEnabled: vi.fn().mockReturnValue(false),
    };
    vi.spyOn(ConfigManager.prototype, 'isInitialized').mockImplementation(mockConfigManager.isInitialized);
    vi.spyOn(ConfigManager.prototype, 'load').mockImplementation(mockConfigManager.load);
    vi.spyOn(ConfigManager.prototype, 'isServiceEnabled').mockImplementation(mockConfigManager.isServiceEnabled);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct command definition', () => {
    expect(startCommand.name).toBe('start');
    expect(startCommand.description).toContain('Start Supastorj services');
    expect(startCommand.options).toBeDefined();
    expect(startCommand.options).toHaveLength(7);
  });

  it('should check if project is initialized', async () => {
    mockConfigManager.isInitialized.mockResolvedValue(false);
    
    try {
      await startCommand.action(context, { detach: true });
    } catch (error: any) {
      expect(error.message).toBe('process.exit');
    }

    expect(context.logger.error).toHaveBeenCalledWith(
      'Project not initialized. Run "supastorj init" first.'
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should check for .env file', async () => {
    const { fs } = await import('zx');
    vi.mocked(fs.pathExists).mockImplementation((path: string) => {
      if (path === '.env') return Promise.resolve(false);
      return Promise.resolve(true);
    });
    
    try {
      await startCommand.action(context, { detach: true });
    } catch (error: any) {
      expect(error.message).toBe('process.exit');
    }

    expect(context.logger.error).toHaveBeenCalledWith(
      '.env file not found! Run "supastorj init" first.'
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should check for docker-compose.yml in development mode', async () => {
    const { fs } = await import('zx');
    vi.mocked(fs.pathExists).mockImplementation((path: string) => {
      if (path === 'docker-compose.yml') return Promise.resolve(false);
      return Promise.resolve(true);
    });
    
    try {
      await startCommand.action(context, { detach: true });
    } catch (error: any) {
      expect(error.message).toBe('process.exit');
    }

    expect(context.logger.error).toHaveBeenCalledWith('docker-compose.yml not found!');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should start services in detached mode', async () => {
    const options = { detach: true };
    const { fs } = await import('zx');
    vi.mocked(fs.readFile).mockResolvedValue('ports:\n  - "5432:5432"');
    
    await startCommand.action(context, options);

    expect(context.logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Starting Supastorj in development mode')
    );
    expect(context.logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Services started successfully')
    );
  });

  it('should start services in attached mode', async () => {
    const options = { attach: true };
    const { $ } = await import('zx');
    const { fs } = await import('zx');
    vi.mocked(fs.readFile).mockResolvedValue('ports:\n  - "5432:5432"');
    
    await startCommand.action(context, options);

    expect($).toHaveBeenCalledWith(
      expect.arrayContaining(['docker', 'compose', '-f', 'docker-compose.yml', '-p', 'test-project', 'up'])
    );
  });

  it('should handle --dev option', async () => {
    const options = { detach: true, dev: true };
    const { fs } = await import('zx');
    vi.mocked(fs.readFile).mockResolvedValue('ports:\n  - "5432:5432"');
    
    await startCommand.action(context, options);

    expect(context.logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Starting Supastorj in development mode')
    );
  });

  it('should handle --prod option', async () => {
    const options = { detach: true, prod: true };
    const { fs } = await import('zx');
    vi.mocked(fs.readFile).mockResolvedValue('USE_DOCKER=true\nSERVER_PORT=5000');
    
    await startCommand.action(context, options);

    expect(context.logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Starting Supastorj in production mode')
    );
  });

  it('should handle --build option', async () => {
    const options = { detach: true, build: true };
    const { $ } = await import('zx');
    const { fs } = await import('zx');
    vi.mocked(fs.readFile).mockResolvedValue('ports:\n  - "5432:5432"');
    
    await startCommand.action(context, options);

    expect($).toHaveBeenCalledWith(
      expect.arrayContaining(['docker', 'compose', '-f', 'docker-compose.yml', '-p', 'test-project', 'up', '-d', '--build'])
    );
  });

  it('should handle --scale option', async () => {
    const options = { detach: true, scale: 'storage=3,postgres=2' };
    const { $ } = await import('zx');
    const { fs } = await import('zx');
    vi.mocked(fs.readFile).mockResolvedValue('ports:\n  - "5432:5432"');
    
    await startCommand.action(context, options);

    expect($).toHaveBeenCalledWith(
      expect.arrayContaining(['docker', 'compose', '-f', 'docker-compose.yml', '-p', 'test-project', 'up', '-d', '--scale', 'storage=3', '--scale', 'postgres=2'])
    );
  });

  it('should handle --profile option', async () => {
    const options = { detach: true, profile: 'redis' };
    const { $ } = await import('zx');
    const { fs } = await import('zx');
    vi.mocked(fs.readFile).mockResolvedValue('ports:\n  - "5432:5432"');
    
    await startCommand.action(context, options);

    expect($).toHaveBeenCalledWith(
      expect.arrayContaining(['docker', 'compose', '-f', 'docker-compose.yml', '-p', 'test-project', '--profile', 'redis', 'up', '-d'])
    );
  });

  it('should auto-detect profiles based on configuration', async () => {
    const options = { detach: true };
    const { $ } = await import('zx');
    const { fs } = await import('zx');
    vi.mocked(fs.readFile).mockResolvedValue('ports:\n  - "5432:5432"');
    
    // Set S3 storage backend
    context.config.storageBackend = StorageBackendType.S3;
    mockConfigManager.load.mockResolvedValue(context.config);
    
    await startCommand.action(context, options);

    expect($).toHaveBeenCalledWith(
      expect.arrayContaining(['docker', 'compose', '-f', 'docker-compose.yml', '-p', 'test-project', '--profile', 's3', 'up', '-d'])
    );
  });

  it('should check port availability', async () => {
    const options = { detach: true };
    const { fs } = await import('zx');
    vi.mocked(fs.readFile).mockResolvedValue('ports:\n  - "5432:5432"');
    
    await startCommand.action(context, options);

    expect(context.logger.info).toHaveBeenCalledWith('Checking port availability...');
    expect(context.logger.info).toHaveBeenCalledWith(
      expect.stringContaining('All required ports are available')
    );
  });

  it('should handle occupied ports', async () => {
    const options = { detach: true };
    const { fs } = await import('zx');
    vi.mocked(fs.readFile).mockResolvedValue('ports:\n  - "5432:5432"');
    
    // Mock createServer to simulate port conflict
    const net = await import('net');
    vi.mocked(net.createServer).mockReturnValue({
      once: vi.fn((event, callback) => {
        if (event === 'error') {
          callback();
        }
      }),
      close: vi.fn(),
      listen: vi.fn(),
    } as any);
    
    try {
      await startCommand.action(context, options);
    } catch (error: any) {
      expect(error.message).toBe('process.exit');
    }

    expect(context.logger.error).toHaveBeenCalledWith('Port conflict detected');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should handle docker compose errors', async () => {
    const options = { detach: true };
    const { $ } = await import('zx');
    const { fs } = await import('zx');
    vi.mocked(fs.readFile).mockResolvedValue('ports:\n  - "5432:5432"');
    vi.mocked($).mockRejectedValue(new Error('Docker not found'));
    
    try {
      await startCommand.action(context, options);
    } catch (error: any) {
      expect(error.message).toBe('process.exit');
    }

    expect(context.logger.error).toHaveBeenCalledWith('Failed to start services');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should use docker-compose fallback', async () => {
    const options = { detach: true };
    const { $ } = await import('zx');
    const { fs } = await import('zx');
    vi.mocked(fs.readFile).mockResolvedValue('ports:\n  - "5432:5432"');
    
    // Mock $ to fail on 'docker compose' but succeed on 'docker-compose'
    vi.mocked($).mockImplementation((strings: TemplateStringsArray) => {
      const cmd = strings.join('');
      if (cmd.includes('docker compose version')) {
        return Promise.reject(new Error('not found'));
      }
      if (cmd.includes('docker-compose version')) {
        return Promise.resolve({ stdout: 'docker-compose version 1.29.0' });
      }
      return Promise.resolve({
        stdout: '',
        stderr: '',
        exitCode: 0,
        pipe: vi.fn().mockReturnThis(),
      });
    });
    
    await startCommand.action(context, options);

    expect($).toHaveBeenCalledWith(
      expect.arrayContaining(['docker-compose', '-f', 'docker-compose.yml', '-p', 'test-project', 'up', '-d'])
    );
  });
});