/**
 * Configuration management with environment inheritance
 */

import { z } from 'zod';
import { constants } from 'fs';
import { config as dotenvConfig } from 'dotenv';
import { access, readFile, writeFile } from 'fs/promises';
import { load as parseYaml, dump as stringifyYaml } from 'js-yaml';

import { 
  CliConfig, 
  Environment, 
  ServiceConfig, 
  CliConfigSchema,
  EnvironmentConfig 
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

    // Apply environment inheritance
    this.config = this.applyInheritance(validatedConfig);

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
   * Get environment configuration
   */
  getEnvironmentConfig(env?: Environment): EnvironmentConfig {
    const config = this.getConfig();
    const environment = env || this.environment;
    
    const envConfig = config.environments[environment];
    if (!envConfig) {
      throw new Error(`Environment configuration not found: ${environment}`);
    }
    
    return envConfig;
  }

  /**
   * Get service configuration
   */
  getServiceConfig(serviceName: string, env?: Environment): ServiceConfig {
    const envConfig = this.getEnvironmentConfig(env);
    const serviceConfig = envConfig.services[serviceName];
    
    if (!serviceConfig) {
      throw new Error(`Service configuration not found: ${serviceName}`);
    }
    
    return serviceConfig;
  }

  /**
   * Set current environment
   */
  setEnvironment(environment: Environment): void {
    this.environment = environment;
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
  static generateDefault(): CliConfig {
    return {
      version: '1.0',
      environments: {
        [Environment.Development]: {
          name: 'development',
          services: {
            postgres: {
              name: 'postgres',
              type: 'postgres' as any,
              image: 'postgres:16-alpine',
              ports: ['${POSTGRES_PORT:-5432}:5432'],
              environment: {
                POSTGRES_DB: '${POSTGRES_DB:-storage}',
                POSTGRES_USER: '${POSTGRES_USER:-postgres}',
                POSTGRES_PASSWORD: '${POSTGRES_PASSWORD:-postgres}',
              },
              volumes: [
                'postgres_data:/var/lib/postgresql/data',
                './config/postgres:/docker-entrypoint-initdb.d:ro'
              ],
              healthcheck: {
                test: ['CMD-SHELL', 'pg_isready -U ${POSTGRES_USER:-postgres}'],
                interval: '1s',
                timeout: '2s',
                retries: 10,
              },
            },
            pg_bouncer: {
              name: 'pg_bouncer',
              type: 'postgres' as any,
              image: 'pgbouncer/pgbouncer:latest',
              ports: ['${PGBOUNCER_PORT:-6432}:6432'],
              environment: {
                DATABASES_HOST: 'postgres',
                DATABASES_PORT: '5432',
                DATABASES_USER: '${POSTGRES_USER:-postgres}',
                DATABASES_PASSWORD: '${POSTGRES_PASSWORD:-postgres}',
                DATABASES_DBNAME: '${POSTGRES_DB:-storage}',
                POOL_MODE: '${PGBOUNCER_POOL_MODE:-transaction}',
                SERVER_RESET_QUERY: 'DISCARD ALL',
                MAX_CLIENT_CONN: '${PGBOUNCER_MAX_CLIENT_CONN:-100}',
                DEFAULT_POOL_SIZE: '${PGBOUNCER_DEFAULT_POOL_SIZE:-20}',
                MAX_DB_CONNECTIONS: '${PGBOUNCER_MAX_DB_CONNECTIONS:-50}',
              },
              depends_on: ['postgres'],
            },
            minio: {
              name: 'minio',
              type: 'storage' as any,
              image: 'minio/minio:latest',
              ports: ['${MINIO_PORT:-9000}:9000', '${MINIO_CONSOLE_PORT:-9001}:9001'],
              environment: {
                MINIO_ROOT_USER: '${MINIO_ROOT_USER:-supastorj}',
                MINIO_ROOT_PASSWORD: '${MINIO_ROOT_PASSWORD:-supastor123}',
                MINIO_DEFAULT_BUCKETS: '${MINIO_DEFAULT_BUCKETS:-storage}',
              },
              volumes: ['minio_data:/data'],
              healthcheck: {
                test: ['CMD', 'curl', '-f', 'http://localhost:9000/minio/health/live'],
                interval: '30s',
                timeout: '20s',
                retries: 3,
              },
            },
            minio_setup: {
              name: 'minio_setup',
              type: 'storage' as any,
              image: 'minio/mc:latest',
              depends_on: ['minio'],
            },
            storage: {
              name: 'storage',
              type: 'storage' as any,
              image: 'supabase/storage-api:latest',
              ports: ['${STORAGE_PORT:-5000}:5000'],
              environment: {
                SERVER_PORT: '5000',
                AUTH_JWT_SECRET: '${JWT_SECRET}',
                AUTH_JWT_ALGORITHM: '${JWT_ALGORITHM:-HS256}',
                ANON_KEY: '${ANON_KEY}',
                SERVICE_KEY: '${SERVICE_KEY}',
                DATABASE_URL: 'postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD:-postgres}@postgres:5432/${POSTGRES_DB:-storage}',
                DATABASE_POOL_URL: 'postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD:-postgres}@pg_bouncer:6432/${POSTGRES_DB:-storage}',
                DB_INSTALL_ROLES: '${DB_INSTALL_ROLES:-true}',
                STORAGE_BACKEND: '${STORAGE_BACKEND:-s3}',
                STORAGE_S3_BUCKET: '${STORAGE_S3_BUCKET:-storage}',
                STORAGE_S3_ENDPOINT: '${STORAGE_S3_ENDPOINT:-http://minio:9000}',
                STORAGE_S3_FORCE_PATH_STYLE: '${STORAGE_S3_FORCE_PATH_STYLE:-true}',
                STORAGE_S3_REGION: '${STORAGE_S3_REGION:-us-east-1}',
                AWS_ACCESS_KEY_ID: '${AWS_ACCESS_KEY_ID:-${MINIO_ROOT_USER:-supastorj}}',
                AWS_SECRET_ACCESS_KEY: '${AWS_SECRET_ACCESS_KEY:-${MINIO_ROOT_PASSWORD:-supastor123}}',
                FILE_STORAGE_BACKEND_PATH: '/var/lib/storage',
                UPLOAD_FILE_SIZE_LIMIT: '${UPLOAD_FILE_SIZE_LIMIT:-524288000}',
                UPLOAD_FILE_SIZE_LIMIT_STANDARD: '${UPLOAD_FILE_SIZE_LIMIT_STANDARD:-52428800}',
                UPLOAD_SIGNED_URL_EXPIRATION_TIME: '${UPLOAD_SIGNED_URL_EXPIRATION_TIME:-120}',
                TUS_URL_PATH: '${TUS_URL_PATH:-/upload/resumable}',
                TUS_URL_EXPIRY_MS: '${TUS_URL_EXPIRY_MS:-3600000}',
                IMAGE_TRANSFORMATION_ENABLED: '${IMAGE_TRANSFORMATION_ENABLED:-true}',
                IMGPROXY_URL: '${IMGPROXY_URL:-http://imgproxy:8080}',
                IMGPROXY_REQUEST_TIMEOUT: '${IMGPROXY_REQUEST_TIMEOUT:-15}',
                TENANT_ID: '${TENANT_ID:-supastorj}',
                REGION: '${REGION:-us-east-1}',
                GLOBAL_S3_BUCKET: '${GLOBAL_S3_BUCKET:-}',
              },
              volumes: ['storage_data:/var/lib/storage'],
              depends_on: ['postgres', 'pg_bouncer', 'minio_setup'],
            },
            'postgres-meta': {
              name: 'postgres-meta',
              type: 'postgres-meta' as any,
              image: 'supabase/postgres-meta:latest',
              ports: ['${POSTGRES_META_PORT:-8080}:8080'],
              environment: {
                PG_META_PORT: '8080',
                PG_META_DB_HOST: 'postgres',
                PG_META_DB_PORT: '5432',
                PG_META_DB_NAME: '${POSTGRES_DB:-storage}',
                PG_META_DB_USER: '${POSTGRES_USER:-postgres}',
                PG_META_DB_PASSWORD: '${POSTGRES_PASSWORD:-postgres}',
                PG_META_DB_SSL: '${POSTGRES_SSL:-disable}',
              },
              depends_on: ['postgres'],
              healthcheck: {
                test: ['CMD', 'node', '-e', 'fetch("http://localhost:8080/health").then((r) => {if (r.status !== 200) throw new Error(r.status)})'],
                interval: '5s',
                timeout: '5s',
                retries: 3,
              },
            },
            imgproxy: {
              name: 'imgproxy',
              type: 'storage' as any,
              image: 'darthsim/imgproxy:latest',
              environment: {
                IMGPROXY_BIND: ':8080',
                IMGPROXY_LOCAL_FILESYSTEM_ROOT: '/var/lib/storage',
                IMGPROXY_USE_ETAG: '${IMGPROXY_USE_ETAG:-true}',
                IMGPROXY_ENABLE_WEBP_DETECTION: '${IMGPROXY_ENABLE_WEBP_DETECTION:-true}',
                IMGPROXY_JPEG_PROGRESSIVE: '${IMGPROXY_JPEG_PROGRESSIVE:-false}',
                IMGPROXY_PNG_INTERLACED: '${IMGPROXY_PNG_INTERLACED:-false}',
                IMGPROXY_QUALITY: '${IMGPROXY_QUALITY:-95}',
                IMGPROXY_MAX_SRC_RESOLUTION: '${IMGPROXY_MAX_SRC_RESOLUTION:-50}',
                IMGPROXY_MAX_SRC_FILE_SIZE: '${IMGPROXY_MAX_SRC_FILE_SIZE:-104857600}',
                IMGPROXY_SECRET: '${IMGPROXY_SECRET:-}',
                IMGPROXY_SALT: '${IMGPROXY_SALT:-}',
              },
              volumes: ['storage_data:/var/lib/storage:ro'],
            },
            redis: {
              name: 'redis',
              type: 'storage' as any,
              image: 'redis:7-alpine',
              ports: ['${REDIS_PORT:-6379}:6379'],
              environment: {
                REDIS_PASSWORD: '${REDIS_PASSWORD:-supastor123}',
              },
              volumes: ['redis_data:/data'],
            },
          },
          variables: {
            LOG_LEVEL: 'debug',
          },
        },
        [Environment.Production]: {
          name: 'production',
          extends: 'development',
          services: {
            postgres: {
              name: 'postgres',
              type: 'postgres' as any,
              environment: {
                POSTGRES_PASSWORD: '${POSTGRES_PASSWORD}',
              },
            },
            storage: {
              name: 'storage',
              type: 'storage' as any,
              environment: {
                LOG_LEVEL: 'info',
                STORAGE_BACKEND: 's3',
                STORAGE_S3_BUCKET: '${STORAGE_S3_BUCKET}',
                STORAGE_S3_ENDPOINT: '${STORAGE_S3_ENDPOINT}',
                STORAGE_S3_REGION: '${STORAGE_S3_REGION}',
                AWS_ACCESS_KEY_ID: '${AWS_ACCESS_KEY_ID}',
                AWS_SECRET_ACCESS_KEY: '${AWS_SECRET_ACCESS_KEY}',
                UPLOAD_FILE_SIZE_LIMIT: '${UPLOAD_FILE_SIZE_LIMIT:-1073741824}',
                UPLOAD_FILE_SIZE_LIMIT_STANDARD: '${UPLOAD_FILE_SIZE_LIMIT_STANDARD:-104857600}',
                UPLOAD_SIGNED_URL_EXPIRATION_TIME: '${UPLOAD_SIGNED_URL_EXPIRATION_TIME:-300}',
                RATE_LIMITER_ENABLED: '${RATE_LIMITER_ENABLED:-true}',
                RATE_LIMITER_REDIS_URL: 'redis://redis:6379',
              },
            },
            'postgres-meta': {
              name: 'postgres-meta',
              type: 'postgres-meta' as any,
              environment: {
                PG_META_DB_SSL: '${POSTGRES_SSL:-require}',
              },
            },
            imgproxy: {
              name: 'imgproxy',
              type: 'storage' as any,
              environment: {
                IMGPROXY_SECRET: '${IMGPROXY_SECRET}',
                IMGPROXY_SALT: '${IMGPROXY_SALT}',
                IMGPROXY_ENABLE_PROMETHEUS_METRICS: '${IMGPROXY_ENABLE_PROMETHEUS_METRICS:-true}',
                IMGPROXY_WORKERS: '${IMGPROXY_WORKERS:-4}',
                IMGPROXY_MAX_CLIENTS: '${IMGPROXY_MAX_CLIENTS:-512}',
                IMGPROXY_TTL: '${IMGPROXY_TTL:-3600}',
              },
            },
            redis: {
              name: 'redis',
              type: 'storage' as any,
              environment: {
                REDIS_MAX_MEMORY: '${REDIS_MAX_MEMORY:-512mb}',
              },
            },
          },
          variables: {
            LOG_LEVEL: 'info',
          },
        },
      },
      settings: {
        logLevel: 'info',
        auditLog: true,
        telemetry: false,
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
   * Apply environment inheritance
   */
  private applyInheritance(config: CliConfig): CliConfig {
    const resolvedEnvironments: Record<string, EnvironmentConfig> = {};

    // Resolve each environment
    for (const [envName, envConfig] of Object.entries(config.environments)) {
      resolvedEnvironments[envName] = this.resolveEnvironment(
        envName,
        envConfig,
        config.environments,
        new Set()
      );
    }

    return {
      ...config,
      environments: resolvedEnvironments,
    };
  }

  /**
   * Resolve a single environment with inheritance
   */
  private resolveEnvironment(
    name: string,
    config: EnvironmentConfig,
    allEnvironments: Record<string, EnvironmentConfig>,
    visited: Set<string>
  ): EnvironmentConfig {
    // Check for circular dependencies
    if (visited.has(name)) {
      throw new Error(`Circular dependency detected in environment inheritance: ${name}`);
    }
    visited.add(name);

    // If no inheritance, return as-is
    if (!config.extends) {
      return config;
    }

    // Get parent configuration
    const parentConfig = allEnvironments[config.extends];
    if (!parentConfig) {
      throw new Error(`Parent environment not found: ${config.extends}`);
    }

    // Resolve parent first
    const resolvedParent = this.resolveEnvironment(
      config.extends,
      parentConfig,
      allEnvironments,
      visited
    );

    // Merge configurations (child overrides parent)
    return this.mergeEnvironments(resolvedParent, config);
  }

  /**
   * Merge two environment configurations
   */
  private mergeEnvironments(
    parent: EnvironmentConfig,
    child: EnvironmentConfig
  ): EnvironmentConfig {
    const merged: EnvironmentConfig = {
      name: child.name,
      services: { ...parent.services },
      variables: { ...parent.variables, ...child.variables },
    };

    // Merge services
    for (const [serviceName, serviceConfig] of Object.entries(child.services)) {
      if (parent.services[serviceName]) {
        // Deep merge service configuration
        merged.services[serviceName] = this.mergeServices(
          parent.services[serviceName],
          serviceConfig
        );
      } else {
        merged.services[serviceName] = serviceConfig;
      }
    }

    return merged;
  }

  /**
   * Merge two service configurations
   */
  private mergeServices(parent: ServiceConfig, child: ServiceConfig): ServiceConfig {
    return {
      ...parent,
      ...child,
      environment: { ...parent.environment, ...child.environment },
      volumes: child.volumes || parent.volumes,
      ports: child.ports || parent.ports,
      depends_on: child.depends_on || parent.depends_on,
      healthcheck: child.healthcheck || parent.healthcheck,
    };
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