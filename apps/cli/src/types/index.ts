/**
 * Core type definitions for Supastorj CLI
 */

import { z } from 'zod';

/**
 * Environment types
 */
export enum Environment {
  Development = 'development',
  Staging = 'staging',
  Production = 'production',
}

/**
 * Deployment mode types
 */
export enum DeploymentMode {
  Docker = 'docker',
  BareMetal = 'baremetal',
}

/**
 * Storage backend types
 */
export enum StorageBackendType {
  File = 'file',
  S3 = 's3',
}

/**
 * Service types
 */
export enum ServiceType {
  Postgres = 'postgres',
  Storage = 'storage',
  PostgresMeta = 'postgres-meta',
  Nginx = 'nginx',
}

/**
 * Service status
 */
export enum ServiceStatus {
  Running = 'running',
  Stopped = 'stopped',
  Starting = 'starting',
  Stopping = 'stopping',
  Restarting = 'restarting',
  Error = 'error',
  Unknown = 'unknown',
}

/**
 * Plugin types
 */
export enum PluginType {
  Command = 'command',
  Service = 'service',
  UI = 'ui',
  Hook = 'hook',
}

/**
 * Event types
 */
export enum EventType {
  ServiceStart = 'service:start',
  ServiceStop = 'service:stop',
  ServiceError = 'service:error',
  ConfigChange = 'config:change',
  PluginLoad = 'plugin:load',
  PluginUnload = 'plugin:unload',
  CommandExecute = 'command:execute',
  CommandComplete = 'command:complete',
  CommandError = 'command:error',
}

/**
 * Service configuration
 */
export const ServiceConfigSchema = z.object({
  name: z.string(),
  type: z.nativeEnum(ServiceType),
  image: z.string().optional(),
  ports: z.array(z.string()).optional(),
  environment: z.record(z.string()).optional(),
  volumes: z.array(z.string()).optional(),
  depends_on: z.array(z.string()).optional(),
  healthcheck: z.object({
    test: z.array(z.string()),
    interval: z.string().optional(),
    timeout: z.string().optional(),
    retries: z.number().optional(),
  }).optional(),
});

export type ServiceConfig = z.infer<typeof ServiceConfigSchema>;

/**
 * Environment configuration
 */
export const EnvironmentConfigSchema = z.object({
  name: z.string(),
  extends: z.string().optional(),
  services: z.record(ServiceConfigSchema),
  variables: z.record(z.string()).optional(),
});

export type EnvironmentConfig = z.infer<typeof EnvironmentConfigSchema>;

/**
 * Supastorj configuration - stored in .supastorj/config.json
 */
export const SupastorjConfigSchema = z.object({
  version: z.string().default('1.0.0'),
  projectName: z.string(),
  environment: z.nativeEnum(Environment).default(Environment.Development),
  storageBackend: z.nativeEnum(StorageBackendType).default(StorageBackendType.File),
  deploymentMode: z.nativeEnum(DeploymentMode).default(DeploymentMode.Docker),
  initialized: z.boolean().default(false),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  services: z.object({
    postgres: z.object({
      enabled: z.boolean().default(true),
      port: z.number().default(5432),
      host: z.string().default('localhost'),
    }).optional(),
    pgBouncer: z.object({
      enabled: z.boolean().default(true),
      port: z.number().default(6432),
      host: z.string().default('localhost'),
    }).optional(),
    storage: z.object({
      enabled: z.boolean().default(true),
      port: z.number().default(5000),
      host: z.string().default('localhost'),
    }).optional(),
    postgresMeta: z.object({
      enabled: z.boolean().default(true),
      port: z.number().default(8080),
      host: z.string().default('localhost'),
    }).optional(),
    minio: z.object({
      enabled: z.boolean().default(false),
      port: z.number().default(9000),
      consolePort: z.number().default(9001),
      host: z.string().default('localhost'),
    }).optional(),
    imgproxy: z.object({
      enabled: z.boolean().default(false),
      port: z.number().default(8080),
      host: z.string().default('localhost'),
    }).optional(),
    redis: z.object({
      enabled: z.boolean().default(false),
      port: z.number().default(6379),
      host: z.string().default('localhost'),
    }).optional(),
  }).default({}),
  settings: z.object({
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    auditLog: z.boolean().default(false),
    dockerComposeFile: z.string().default('docker-compose.yml'),
    envFile: z.string().default('.env'),
  }).default({}),
});

export type SupastorjConfig = z.infer<typeof SupastorjConfigSchema>;

// Legacy alias for backward compatibility
export const CliConfigSchema = SupastorjConfigSchema;
export type CliConfig = SupastorjConfig;

/**
 * Command context
 */
export interface CommandContext {
  config: CliConfig;
  environment: Environment;
  logger: Logger;
  eventBus: EventBus;
}

/**
 * Plugin interface
 */
export interface Plugin {
  name: string;
  version: string;
  type: PluginType;
  init(context: PluginContext): Promise<void>;
  destroy?(): Promise<void>;
}

/**
 * Plugin context
 */
export interface PluginContext extends CommandContext {
  registerCommand?(command: CommandDefinition): void;
  registerService?(service: ServiceAdapter): void;
  registerUI?(component: React.ComponentType): void;
  registerHook?(event: EventType, handler: EventHandler): void;
}

/**
 * Command definition
 */
export interface CommandDefinition {
  name: string;
  description: string;
  options?: CommandOption[];
  action: (context: CommandContext, ...args: any[]) => Promise<void>;
}

/**
 * Command option
 */
export interface CommandOption {
  flags: string;
  description: string;
  defaultValue?: any;
}

/**
 * Service adapter interface
 */
export interface ServiceAdapter {
  name: string;
  type: ServiceType;
  start(): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  status(): Promise<ServiceStatus>;
  logs(options?: LogOptions): AsyncIterable<string>;
  healthcheck(): Promise<HealthCheckResult>;
}

/**
 * Log options
 */
export interface LogOptions {
  follow?: boolean;
  tail?: number;
  since?: Date;
  until?: Date;
  signal?: AbortSignal;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  healthy: boolean;
  message?: string;
  details?: Record<string, any>;
}

/**
 * Event bus interface
 */
export interface EventBus {
  emit<T = any>(event: EventType, data?: T): void;
  on<T = any>(event: EventType, handler: EventHandler<T>): void;
  off(event: EventType, handler: EventHandler): void;
  once<T = any>(event: EventType, handler: EventHandler<T>): void;
}

/**
 * Event handler
 */
export type EventHandler<T = any> = (data: T) => void | Promise<void>;

/**
 * Logger interface
 */
export interface Logger {
  debug(message: string, meta?: any): void;
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
  audit(action: string, meta?: any): void;
}

/**
 * Docker compose configuration
 */
export interface DockerComposeConfig {
  version: string;
  services: Record<string, DockerComposeService>;
  networks?: Record<string, any>;
  volumes?: Record<string, any>;
}

/**
 * Docker compose service
 */
export interface DockerComposeService {
  image?: string;
  build?: string | { context: string; dockerfile?: string };
  ports?: string[];
  environment?: Record<string, string> | string[];
  volumes?: string[];
  depends_on?: string[] | Record<string, { condition: string }>;
  restart?: string;
  healthcheck?: {
    test: string[] | string;
    interval?: string;
    timeout?: string;
    retries?: number;
    start_period?: string;
  };
  deploy?: {
    replicas?: number;
    restart_policy?: {
      condition: string;
      delay?: string;
      max_attempts?: number;
    };
  };
}

/**
 * Storage bucket
 */
export interface StorageBucket {
  id: string;
  name: string;
  public: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Storage object
 */
export interface StorageObject {
  name: string;
  bucket_id: string;
  owner: string;
  created_at: string;
  updated_at: string;
  last_accessed_at?: string;
  metadata?: Record<string, any>;
}

/**
 * Database migration
 */
export interface Migration {
  version: string;
  name: string;
  up: string;
  down: string;
  executed_at?: string;
}

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  user: string;
  action: string;
  resource?: string;
  details?: Record<string, any>;
  result: 'success' | 'failure';
  error?: string;
}