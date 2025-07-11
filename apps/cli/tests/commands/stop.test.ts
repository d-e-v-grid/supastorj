/**
 * Stop command tests
 */

import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { stopCommand } from '../../src/commands/stop.js';
import { CommandContext, Environment } from '../../src/types/index.js';
import { setupZxMocks, setupFsMocks, createTestContext, mockProcessExit, mockConfigManager } from '../test-utils.js';

// Setup common mocks
setupZxMocks();
setupFsMocks();

describe('Stop Command', () => {
  let context: CommandContext;
  let mockExit: any;
  let configManagerMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    context = createTestContext({
      projectName: 'test-project',
      environment: Environment.Development,
    });

    mockExit = mockProcessExit();
    configManagerMock = mockConfigManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct command definition', () => {
    expect(stopCommand.name).toBe('stop');
    expect(stopCommand.description).toContain('Stop Supastorj services');
    expect(stopCommand.options).toBeDefined();
    expect(stopCommand.options).toHaveLength(3);
  });

  it('should check if project is initialized', async () => {
    configManagerMock.isInitialized.mockResolvedValue(false);
    
    try {
      await stopCommand.action(context, {});
    } catch (error: any) {
      expect(error.message).toBe('process.exit');
    }

    expect(context.logger.error).toHaveBeenCalledWith(
      'Project not initialized. Run "supastorj init" first.'
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should stop services in development mode', async () => {
    const options = {};
    const { $ } = await import('zx');
    
    try {
      await stopCommand.action(context, options);
    } catch (error: any) {
      expect(error.message).toBe('process.exit');
    }

    expect(context.logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Stopping Supastorj in development mode')
    );
    expect($).toHaveBeenCalledWith(
      expect.arrayContaining(['docker', 'compose', '-f', 'docker-compose.yml', '-p', 'test-project', 'down'])
    );
    expect(context.logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Services stopped successfully')
    );
  });

  it('should handle --volumes option', async () => {
    const options = { volumes: true };
    const { $ } = await import('zx');
    
    try {
      await stopCommand.action(context, options);
    } catch (error: any) {
      expect(error.message).toBe('process.exit');
    }

    expect($).toHaveBeenCalledWith(
      expect.arrayContaining(['docker', 'compose', '-f', 'docker-compose.yml', '-p', 'test-project', 'down', '-v'])
    );
  });

  it('should handle --dev option', async () => {
    const options = { dev: true };
    const { $ } = await import('zx');
    
    try {
      await stopCommand.action(context, options);
    } catch (error: any) {
      expect(error.message).toBe('process.exit');
    }

    expect(context.logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Stopping Supastorj in development mode')
    );
  });

  it('should handle --prod option', async () => {
    const options = { prod: true };
    const { $ } = await import('zx');
    const { fs } = await import('zx');
    vi.mocked(fs.readFile).mockResolvedValue('USE_DOCKER=true\nSERVER_PORT=5000');
    
    try {
      await stopCommand.action(context, options);
    } catch (error: any) {
      expect(error.message).toBe('process.exit');
    }

    expect(context.logger.info).toHaveBeenCalledWith(
      'Stopping Supastorj services in production mode...'
    );
  });

  it('should handle docker compose errors', async () => {
    const options = {};
    const { $ } = await import('zx');
    vi.mocked($).mockRejectedValue(new Error('Docker not found'));
    
    try {
      await stopCommand.action(context, options);
    } catch (error: any) {
      expect(error.message).toBe('process.exit');
    }

    expect(context.logger.error).toHaveBeenCalledWith('Failed to stop services');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should use docker-compose fallback', async () => {
    const options = {};
    const { $ } = await import('zx');
    
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
      });
    });
    
    try {
      await stopCommand.action(context, options);
    } catch (error: any) {
      expect(error.message).toBe('process.exit');
    }

    expect($).toHaveBeenCalledWith(
      expect.arrayContaining(['docker-compose', '-f', 'docker-compose.yml', '-p', 'test-project', 'down'])
    );
  });

  it('should stop production services', async () => {
    const options = { prod: true };
    const { $ } = await import('zx');
    const { fs } = await import('zx');
    
    // Mock for production mode with Docker
    vi.mocked(fs.readFile).mockResolvedValue('USE_DOCKER=false\nSERVER_PORT=5000');
    vi.mocked($).mockImplementation((strings: TemplateStringsArray) => {
      const cmd = strings.join('');
      if (cmd.includes('pgrep')) {
        return Promise.resolve({ stdout: '12345' });
      }
      return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
    });
    
    try {
      await stopCommand.action(context, options);
    } catch (error: any) {
      expect(error.message).toBe('process.exit');
    }

    // Should check for running processes
    expect($).toHaveBeenCalledWith(
      expect.arrayContaining(['pgrep -f "node.*storage.*server.js"'])
    );
  });
});