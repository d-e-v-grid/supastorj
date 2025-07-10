/**
 * Configuration management for Supastorj CLI
 */

import { z } from 'zod';
import { constants } from 'fs';
import { config as dotenvConfig } from 'dotenv';
import { access, readFile, writeFile } from 'fs/promises';
import { load as parseYaml, dump as stringifyYaml } from 'js-yaml';

import { 
  CliConfig, 
  Environment, 
  CliConfigSchema,
  StorageBackendType 
} from '../types/index.js';

export interface ConfigManagerOptions {
  configPath?: string;
  envPath?: string;
  environment?: Environment;
}

export class ConfigManager {
  private config?: CliConfig;
  private configPath: string;
  private envPath: string;
  private environment: Environment;
  private envVars: Record<string, string> = {};

  constructor(options: ConfigManagerOptions = {}) {
    this.configPath = options.configPath || './supastorj.config.yaml';
    this.envPath = options.envPath || './.env';
    this.environment = options.environment || Environment.Development;
  }

  /**
   * Load configuration from file
   */
  async load(): Promise<CliConfig> {
    // Load environment variables
    await this.loadEnvVars();

    // Check if config file exists
    const configExists = await this.fileExists(this.configPath);
    if (!configExists) {
      throw new Error(`Configuration file not found: ${this.configPath}`);
    }

    // Read and parse config file
    const configContent = await readFile(this.configPath, 'utf-8');
    const rawConfig = parseYaml(configContent) as any;

    // Interpolate environment variables
    const interpolatedConfig = this.interpolateEnvVars(rawConfig);

    // Validate configuration
    const validatedConfig = CliConfigSchema.parse(interpolatedConfig);

    this.config = validatedConfig;

    return this.config;
  }

  /**
   * Save configuration to file
   */
  async save(config: CliConfig): Promise<void> {
    const validatedConfig = CliConfigSchema.parse(config);
    const yamlContent = stringifyYaml(validatedConfig, {
      indent: 2,
      lineWidth: 120,
    });
    
    await writeFile(this.configPath, yamlContent, 'utf-8');
    this.config = validatedConfig;
  }

  /**
   * Get current configuration
   */
  getConfig(): CliConfig {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call load() first.');
    }
    return this.config;
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
  isServiceEnabled(serviceName: 'postgres' | 'storage' | 'imgproxy'): boolean {
    const config = this.getConfig();
    return config.services?.[serviceName]?.enabled ?? true;
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
  static generateDefault(storageBackend: StorageBackendType = StorageBackendType.File): CliConfig {
    return {
      version: '1.0.0',
      projectName: 'supastorj',
      environment: Environment.Development,
      storageBackend,
      services: {
        postgres: {
          enabled: true,
          port: 5432,
        },
        storage: {
          enabled: true,
          port: 5000,
        },
        imgproxy: {
          enabled: false,
          port: 8080,
        },
      },
      settings: {
        logLevel: 'info',
        auditLog: false,
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
   * Load environment variables
   */
  private async loadEnvVars(): Promise<void> {
    // Load from .env file
    const envExists = await this.fileExists(this.envPath);
    if (envExists) {
      const result = dotenvConfig({ path: this.envPath });
      if (result.parsed) {
        this.envVars = { ...this.envVars, ...result.parsed };
      }
    }

    // Merge with process.env (filter out undefined values)
    const processEnvVars = Object.entries(process.env)
      .filter(([, value]) => value !== undefined)
      .reduce((acc, [key, value]) => ({ ...acc, [key]: value! }), {});
    this.envVars = { ...this.envVars, ...processEnvVars };
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