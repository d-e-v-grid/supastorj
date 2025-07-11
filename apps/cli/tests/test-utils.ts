/**
 * Common test utilities and mocks
 */

import { vi } from 'vitest';

import { LoggerImpl } from '../src/core/logger.js';
import { EventBusImpl } from '../src/core/event-bus.js';
import { ConfigManager } from '../src/config/config-manager.js';
import { Environment, CommandContext } from '../src/types/index.js';

// Mock zx with common functionality
export const setupZxMocks = () => {
  vi.mock('zx', () => {
    const mockExec = vi.fn().mockImplementation((strings: TemplateStringsArray, ...values: any[]) => {
      const cmd = strings.reduce((acc, str, i) => acc + str + (values[i] || ''), '');
      
      // Mock different commands
      if (cmd.includes('docker compose version')) {
        return Promise.resolve({ stdout: 'Docker Compose version v2.0.0' });
      }
      if (cmd.includes('docker ps')) {
        return Promise.resolve({ stdout: 'CONTAINER ID' });
      }
      
      // Default response
      return Promise.resolve({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });
    });

    return {
      $: Object.assign(mockExec, { verbose: false }),
      fs: {
        pathExists: vi.fn().mockResolvedValue(true),
        readFile: vi.fn().mockResolvedValue(''),
        writeFile: vi.fn().mockResolvedValue(undefined),
        mkdir: vi.fn().mockResolvedValue(undefined),
        copyFile: vi.fn().mockResolvedValue(undefined),
        unlink: vi.fn().mockResolvedValue(undefined),
      },
      chalk: {
        cyan: (text: string) => text,
        green: (text: string) => text,
        yellow: (text: string) => text,
        red: (text: string) => text,
        dim: (text: string) => text,
      },
      dotenv: {
        load: vi.fn().mockResolvedValue({}),
      },
    };
  });
};

// Mock fs/promises
export const setupFsMocks = () => {
  vi.mock('fs/promises', () => ({
    readFile: vi.fn(),
    writeFile: vi.fn(),
    access: vi.fn(),
    mkdir: vi.fn(),
    copyFile: vi.fn(),
  }));
};

// Create test context
export const createTestContext = (options: {
  projectName?: string;
  environment?: Environment;
  config?: any;
} = {}): CommandContext => {
  const config = options.config || ConfigManager.generateDefault({
    projectName: options.projectName || 'test-project',
    environment: options.environment || Environment.Development,
  });

  const context: CommandContext = {
    config,
    environment: options.environment || Environment.Development,
    logger: new LoggerImpl(),
    eventBus: new EventBusImpl(),
  };

  // Mock logger methods
  vi.spyOn(context.logger, 'info').mockImplementation(() => {});
  vi.spyOn(context.logger, 'error').mockImplementation(() => {});
  vi.spyOn(context.logger, 'debug').mockImplementation(() => {});
  vi.spyOn(context.logger, 'warn').mockImplementation(() => {});
  vi.spyOn(context.logger, 'audit').mockImplementation(() => {});

  return context;
};

// Mock process.exit
export const mockProcessExit = () => vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('process.exit');
  });

// Mock ConfigManager
export const mockConfigManager = (config?: any) => {
  const defaultConfig = config || ConfigManager.generateDefault();
  const mock = {
    isInitialized: vi.fn().mockResolvedValue(true),
    load: vi.fn().mockResolvedValue(defaultConfig),
    save: vi.fn().mockResolvedValue(undefined),
    getConfig: vi.fn().mockReturnValue(defaultConfig),
    getProjectPath: vi.fn().mockReturnValue(process.cwd()),
    getConfigDir: vi.fn().mockReturnValue('.supastorj'),
    getEnvironment: vi.fn().mockReturnValue('development'),
    setEnvironment: vi.fn(),
  };

  vi.spyOn(ConfigManager.prototype, 'isInitialized').mockImplementation(mock.isInitialized);
  vi.spyOn(ConfigManager.prototype, 'load').mockImplementation(mock.load);
  vi.spyOn(ConfigManager.prototype, 'save').mockImplementation(mock.save);
  vi.spyOn(ConfigManager.prototype, 'getConfig').mockImplementation(mock.getConfig);
  vi.spyOn(ConfigManager.prototype, 'getProjectPath').mockImplementation(mock.getProjectPath);
  vi.spyOn(ConfigManager.prototype, 'getConfigDir').mockImplementation(mock.getConfigDir);
  vi.spyOn(ConfigManager.prototype, 'getEnvironment').mockImplementation(mock.getEnvironment);
  vi.spyOn(ConfigManager.prototype, 'setEnvironment').mockImplementation(mock.setEnvironment);

  return mock;
};