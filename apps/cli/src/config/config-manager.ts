/**
 * Configuration management for Supastorj CLI
 */

import { z } from 'zod';
import { join } from 'path';
import { dotenv } from 'zx';
import { constants } from 'fs';
import { mkdir, access, readFile, writeFile } from 'fs/promises';

import {
  Environment,
  DeploymentMode,
  SupastorjConfig,
  StorageBackendType,
  SupastorjConfigSchema
} from '../types/index.js';

export interface ConfigManagerOptions {
  projectPath?: string;
  envPath?: string;
  environment?: Environment;
}

export class ConfigManager {
  private config?: SupastorjConfig;
  private projectPath: string;
  private configDir: string;
  private configPath: string;
  private envPath: string;
  private environment: Environment;
  private envVars: Record<string, string> = {};

  constructor(options: ConfigManagerOptions = {}) {
    this.projectPath = options.projectPath || process.cwd();
    this.configDir = join(this.projectPath, '.supastorj');
    this.configPath = join(this.configDir, 'config.json');
    this.envPath = options.envPath || join(this.projectPath, '.env');
    this.environment = options.environment || Environment.Development;
  }

  /**
   * Load configuration from file
   */
  async load(): Promise<SupastorjConfig> {
    // Load environment variables
    await this.loadEnvVars();

    // Check if config file exists
    const configExists = await this.fileExists(this.configPath);
    if (!configExists) {
      throw new Error(`Configuration not found. Run "supastorj init" to initialize the project.`);
    }

    // Read and parse config file
    const configContent = await readFile(this.configPath, 'utf-8');
    const rawConfig = JSON.parse(configContent);

    // Interpolate environment variables
    const interpolatedConfig = this.interpolateEnvVars(rawConfig);

    // Validate configuration
    const validatedConfig = SupastorjConfigSchema.parse(interpolatedConfig);

    this.config = validatedConfig;

    return this.config;
  }

  /**
   * Save configuration to file
   */
  async save(config: SupastorjConfig): Promise<void> {
    const validatedConfig = SupastorjConfigSchema.parse(config);

    // Ensure config directory exists
    await this.ensureConfigDir();

    // Add/update timestamps
    validatedConfig.updatedAt = new Date().toISOString();
    if (!validatedConfig.createdAt) {
      validatedConfig.createdAt = validatedConfig.updatedAt;
    }

    // Save as formatted JSON
    const jsonContent = JSON.stringify(validatedConfig, null, 2);
    await writeFile(this.configPath, jsonContent, 'utf-8');

    this.config = validatedConfig;
  }

  /**
   * Get current configuration
   */
  getConfig(): SupastorjConfig {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call load() first.');
    }
    return this.config;
  }

  /**
   * Check if project is initialized
   */
  async isInitialized(): Promise<boolean> {
    try {
      const configExists = await this.fileExists(this.configPath);
      if (!configExists) return false;

      const config = await this.load();
      return config.initialized === true;
    } catch {
      return false;
    }
  }

  /**
   * Ensure config directory exists
   */
  private async ensureConfigDir(): Promise<void> {
    if (!(await this.fileExists(this.configDir))) {
      await mkdir(this.configDir, { recursive: true });
    }
  }

  /**
   * Get current environment
   */
  getCurrentEnvironment(): Environment {
    const config = this.getConfig();
    return config.environment;
  }

  /**
   * Check if service is enabled
   */
  isServiceEnabled(serviceName: keyof SupastorjConfig['services']): boolean {
    const config = this.getConfig();
    return config.services?.[serviceName]?.enabled ?? false;
  }

  /**
   * Set current environment
   */
  setEnvironment(environment: Environment): void {
    this.environment = environment;
    if (this.config) {
      this.config.environment = environment;
    }
  }

  /**
   * Get current environment
   */
  getEnvironment(): Environment {
    return this.environment;
  }

  /**
   * Generate default configuration
   */
  static generateDefault(options: {
    projectName?: string;
    storageBackend?: StorageBackendType;
    environment?: Environment;
  } = {}): SupastorjConfig {
    const now = new Date().toISOString();
    const storageBackend = options.storageBackend || StorageBackendType.File;

    return {
      version: '1.0.0',
      projectName: options.projectName || 'supastorj',
      environment: options.environment || Environment.Development,
      storageBackend,
      deploymentMode: DeploymentMode.Docker,
      initialized: true,
      createdAt: now,
      updatedAt: now,
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
          enabled: storageBackend === StorageBackendType.S3,
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
        logLevel: 'info',
        auditLog: false,
        dockerComposeFile: 'docker-compose.yml',
        envFile: '.env',
      },
    };
  }

  /**
   * Validate configuration file
   */
  async validate(): Promise<{ valid: boolean; errors?: z.ZodError }> {
    try {
      await this.load();
      return { valid: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { valid: false, errors: error };
      }
      throw error;
    }
  }

  /**
   * Get config directory path
   */
  getConfigDir(): string {
    return this.configDir;
  }

  /**
   * Get project path
   */
  getProjectPath(): string {
    return this.projectPath;
  }

  /**
   * Load environment variables
   */
  private async loadEnvVars(): Promise<void> {
    // Load from .env file
    const envExists = await this.fileExists(this.envPath);
    let envVars: Record<string, any> = {};
    if (envExists) {
      envVars = await dotenv.load(this.envPath);
    }

    // Store all environment variables (filter out undefined values)
    const processEnvVars = Object.entries(envVars)
      .filter(([, value]) => value !== undefined)
      .reduce((acc, [key, value]) => ({ ...acc, [key]: value! }), {});
    this.envVars = processEnvVars;
  }

  /**
   * Interpolate environment variables in configuration
   */
  private interpolateEnvVars(obj: any): any {
    if (typeof obj === 'string') {
      // Replace ${VAR_NAME} with environment variable value
      return obj.replace(/\${([^}]+)}/g, (match, varName) => this.envVars[varName] || match);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.interpolateEnvVars(item));
    }

    if (typeof obj === 'object' && obj !== null) {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.interpolateEnvVars(value);
      }
      return result;
    }

    return obj;
  }

  /**
   * Check if file exists
   */
  private async fileExists(path: string): Promise<boolean> {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }
}