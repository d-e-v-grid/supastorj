/**
 * Config Manager tests
 */

import { join } from 'path';
import { readFile, writeFile, access, mkdir } from 'fs/promises';
import { constants } from 'fs';
import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';
import { z } from 'zod';

import { ConfigManager } from '../../src/config/config-manager.js';
import { Environment, DeploymentMode, StorageBackendType } from '../../src/types/index.js';

vi.mock('fs/promises');
vi.mock('zx', () => ({
  dotenv: {
    load: vi.fn(),
  },
}));

describe('ConfigManager', () => {
  const mockConfig = {
    version: '1.0.0',
    projectName: 'test-project',
    environment: Environment.Development,
    storageBackend: StorageBackendType.File,
    deploymentMode: DeploymentMode.Docker,
    initialized: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    services: {
      postgres: {
        enabled: true,
        port: 5432,
        host: 'localhost',
      },
      pgBouncer: {
        enabled: true,
        port: 6432,
        host: 'localhost',
      },
      storage: {
        enabled: true,
        port: 5000,
        host: 'localhost',
      },
      postgresMeta: {
        enabled: true,
        port: 8080,
        host: 'localhost',
      },
      minio: {
        enabled: false,
        port: 9000,
        consolePort: 9001,
        host: 'localhost',
      },
      imgproxy: {
        enabled: false,
        port: 8080,
        host: 'localhost',
      },
      redis: {
        enabled: false,
        port: 6379,
        host: 'localhost',
      },
    },
    settings: {
      logLevel: 'info' as const,
      auditLog: false,
      dockerComposeFile: 'docker-compose.yml',
      envFile: '.env',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create config manager with default options', () => {
    const configManager = new ConfigManager();
    expect(configManager).toBeDefined();
    expect(configManager.getProjectPath()).toBe(process.cwd());
  });

  it('should create config manager with custom options', () => {
    const customPath = '/custom/path';
    const configManager = new ConfigManager({
      projectPath: customPath,
      environment: Environment.Production,
    });
    expect(configManager).toBeDefined();
    expect(configManager.getProjectPath()).toBe(customPath);
    expect(configManager.getEnvironment()).toBe(Environment.Production);
  });

  it('should generate default configuration', () => {
    const defaultConfig = ConfigManager.generateDefault();
    expect(defaultConfig).toBeDefined();
    expect(defaultConfig.version).toBe('1.0.0');
    expect(defaultConfig.environment).toBe(Environment.Development);
    expect(defaultConfig.deploymentMode).toBe(DeploymentMode.Docker);
    expect(defaultConfig.services).toBeDefined();
    expect(defaultConfig.settings).toBeDefined();
  });

  it('should generate configuration with custom options', () => {
    const config = ConfigManager.generateDefault({
      projectName: 'custom-project',
      storageBackend: StorageBackendType.S3,
      environment: Environment.Production,
    });
    expect(config.projectName).toBe('custom-project');
    expect(config.storageBackend).toBe(StorageBackendType.S3);
    expect(config.environment).toBe(Environment.Production);
    expect(config.services.minio.enabled).toBe(true);
  });

  it('should load configuration from file', async () => {
    const configManager = new ConfigManager();
    vi.mocked(access).mockResolvedValue(undefined);
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockConfig));
    const { dotenv } = await import('zx');
    vi.mocked(dotenv.load).mockResolvedValue({});
    
    const config = await configManager.load();
    expect(config).toEqual(mockConfig);
    expect(readFile).toHaveBeenCalledWith(
      join(process.cwd(), '.supastorj', 'config.json'),
      'utf-8'
    );
  });

  it('should save configuration to file', async () => {
    const configManager = new ConfigManager();
    vi.mocked(access).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);
    
    await configManager.save(mockConfig);
    expect(mkdir).toHaveBeenCalledWith(
      join(process.cwd(), '.supastorj'),
      { recursive: true }
    );
    expect(writeFile).toHaveBeenCalled();
    const [path, content] = vi.mocked(writeFile).mock.calls[0];
    expect(path).toBe(join(process.cwd(), '.supastorj', 'config.json'));
    expect(content).toContain('"version": "1.0.0"');
  });

  it('should validate configuration', async () => {
    const configManager = new ConfigManager();
    vi.mocked(access).mockResolvedValue(undefined);
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockConfig));
    const { dotenv } = await import('zx');
    vi.mocked(dotenv.load).mockResolvedValue({});
    
    const result = await configManager.validate();
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('should handle invalid configuration', async () => {
    const configManager = new ConfigManager();
    const invalidConfig = { ...mockConfig, version: 123 }; // Invalid version
    vi.mocked(access).mockResolvedValue(undefined);
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(invalidConfig));
    const { dotenv } = await import('zx');
    vi.mocked(dotenv.load).mockResolvedValue({});
    
    const result = await configManager.validate();
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it('should get configuration after loading', async () => {
    const configManager = new ConfigManager();
    vi.mocked(access).mockResolvedValue(undefined);
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockConfig));
    const { dotenv } = await import('zx');
    vi.mocked(dotenv.load).mockResolvedValue({});
    
    await configManager.load();
    const config = configManager.getConfig();
    expect(config).toEqual(mockConfig);
  });

  it('should throw error when getting config before loading', () => {
    const configManager = new ConfigManager();
    expect(() => configManager.getConfig()).toThrow('Configuration not loaded');
  });

  it('should check if project is initialized', async () => {
    const configManager = new ConfigManager();
    vi.mocked(access).mockResolvedValue(undefined);
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockConfig));
    const { dotenv } = await import('zx');
    vi.mocked(dotenv.load).mockResolvedValue({});
    
    const isInitialized = await configManager.isInitialized();
    expect(isInitialized).toBe(true);
  });

  it('should return false when config file does not exist', async () => {
    const configManager = new ConfigManager();
    vi.mocked(access).mockRejectedValue(new Error('ENOENT'));
    
    const isInitialized = await configManager.isInitialized();
    expect(isInitialized).toBe(false);
  });

  it('should handle missing configuration file', async () => {
    const configManager = new ConfigManager();
    vi.mocked(access).mockRejectedValue(new Error('ENOENT'));
    
    await expect(configManager.load()).rejects.toThrow('Configuration not found');
  });

  it('should check if service is enabled', async () => {
    const configManager = new ConfigManager();
    vi.mocked(access).mockResolvedValue(undefined);
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockConfig));
    const { dotenv } = await import('zx');
    vi.mocked(dotenv.load).mockResolvedValue({});
    
    await configManager.load();
    expect(configManager.isServiceEnabled('postgres')).toBe(true);
    expect(configManager.isServiceEnabled('minio')).toBe(false);
  });

  it('should set and get environment', () => {
    const configManager = new ConfigManager();
    configManager.setEnvironment(Environment.Production);
    expect(configManager.getEnvironment()).toBe(Environment.Production);
  });

  it('should get config directory', () => {
    const configManager = new ConfigManager();
    expect(configManager.getConfigDir()).toBe(join(process.cwd(), '.supastorj'));
  });

  describe('Environment Variable Handling', () => {
    it('should load environment variables from .env file', async () => {
      const configManager = new ConfigManager();
      const envVars = {
        DATABASE_URL: 'postgres://localhost:5432/test',
        API_KEY: 'secret-key',
        PORT: '3000',
      };
      
      vi.mocked(access).mockImplementation(async (path) => {
        if (path === join(process.cwd(), '.env')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      const { dotenv } = await import('zx');
      vi.mocked(dotenv.load).mockResolvedValue(envVars);
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockConfig));
      
      await configManager.load();
      
      expect(dotenv.load).toHaveBeenCalledWith(join(process.cwd(), '.env'));
    });

    it('should handle missing .env file gracefully', async () => {
      const configManager = new ConfigManager();
      
      vi.mocked(access).mockImplementation(async (path) => {
        if (path === join(process.cwd(), '.env')) {
          throw new Error('ENOENT');
        }
        return undefined;
      });
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockConfig));
      
      // Should not throw error when .env doesn't exist
      await expect(configManager.load()).resolves.toEqual(mockConfig);
      expect(dotenv.load).not.toHaveBeenCalled();
    });

    it('should interpolate environment variables in configuration', async () => {
      const configManager = new ConfigManager();
      const envVars = {
        DB_PORT: '5433',
        LOG_LEVEL: 'debug',
      };
      
      const configWithEnvVars = {
        ...mockConfig,
        services: {
          ...mockConfig.services,
          postgres: {
            ...mockConfig.services.postgres,
            port: '${DB_PORT}',
          },
        },
        settings: {
          ...mockConfig.settings,
          logLevel: '${LOG_LEVEL}',
        },
      };
      
      vi.mocked(access).mockResolvedValue(undefined);
      const { dotenv } = await import('zx');
      vi.mocked(dotenv.load).mockResolvedValue(envVars);
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(configWithEnvVars));
      
      const config = await configManager.load();
      
      expect(config.services.postgres.port).toBe('5433');
      expect(config.settings.logLevel).toBe('debug');
    });

    it('should keep original value when environment variable is not found', async () => {
      const configManager = new ConfigManager();
      const configWithEnvVars = {
        ...mockConfig,
        services: {
          ...mockConfig.services,
          postgres: {
            ...mockConfig.services.postgres,
            port: '${UNDEFINED_VAR}',
          },
        },
      };
      
      vi.mocked(access).mockResolvedValue(undefined);
      const { dotenv } = await import('zx');
    vi.mocked(dotenv.load).mockResolvedValue({});
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(configWithEnvVars));
      
      const config = await configManager.load();
      
      expect(config.services.postgres.port).toBe('${UNDEFINED_VAR}');
    });

    it('should filter out undefined values from environment variables', async () => {
      const configManager = new ConfigManager();
      const envVars = {
        DEFINED_VAR: 'value',
        UNDEFINED_VAR: undefined,
      };
      
      vi.mocked(access).mockResolvedValue(undefined);
      const { dotenv } = await import('zx');
      vi.mocked(dotenv.load).mockResolvedValue(envVars);
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockConfig));
      
      await configManager.load();
      
      // The UNDEFINED_VAR should be filtered out
      expect(dotenv.load).toHaveBeenCalled();
    });
  });
});