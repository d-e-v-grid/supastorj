/**
 * Docker adapter for container management
 */

import Docker from 'dockerode';
import * as yaml from 'js-yaml';
import { readFile } from 'fs/promises';

import { execDockerCompose } from '../utils/docker-compose.js';
import {
  Logger,
  LogOptions,
  ServiceType,
  ServiceStatus,
  ServiceAdapter,
  HealthCheckResult,
  DockerComposeConfig,
} from '../types/index.js';

export interface DockerAdapterOptions {
  serviceName: string;
  composeFile?: string;
  projectName?: string;
  logger: Logger;
}

export class DockerAdapter implements ServiceAdapter {
  public readonly name: string;
  public readonly type: ServiceType;
  
  private docker: Docker;
  private composeFile: string;
  private projectName: string;
  private logger: Logger;

  constructor(options: DockerAdapterOptions) {
    this.name = options.serviceName;
    this.type = ServiceType.Postgres; // This should be determined from service config
    this.docker = new Docker();
    this.composeFile = options.composeFile || './docker-compose.yml';
    this.projectName = options.projectName || 'supastorj';
    this.logger = options.logger;
  }

  /**
   * Start the service
   */
  async start(): Promise<void> {
    this.logger.info(`Starting service: ${this.name}`);
    
    try {
      await execDockerCompose([
        '-f', this.composeFile,
        '-p', this.projectName,
        'up', '-d', this.name
      ]);
      
      this.logger.info(`Service started: ${this.name}`);
    } catch (error) {
      this.logger.error(`Failed to start service ${this.name}:`, error);
      throw error;
    }
  }

  /**
   * Stop the service
   */
  async stop(): Promise<void> {
    this.logger.info(`Stopping service: ${this.name}`);
    
    try {
      await execDockerCompose([
        '-f', this.composeFile,
        '-p', this.projectName,
        'stop', this.name
      ]);
      
      this.logger.info(`Service stopped: ${this.name}`);
    } catch (error) {
      this.logger.error(`Failed to stop service ${this.name}:`, error);
      throw error;
    }
  }

  /**
   * Restart the service
   */
  async restart(): Promise<void> {
    this.logger.info(`Restarting service: ${this.name}`);
    
    try {
      await execDockerCompose([
        '-f', this.composeFile,
        '-p', this.projectName,
        'restart', this.name
      ]);
      
      this.logger.info(`Service restarted: ${this.name}`);
    } catch (error) {
      this.logger.error(`Failed to restart service ${this.name}:`, error);
      throw error;
    }
  }

  /**
   * Get service status
   */
  async status(): Promise<ServiceStatus> {
    try {
      const containerName = `${this.projectName}-${this.name}-1`;
      const container = this.docker.getContainer(containerName);
      const info = await container.inspect();
      
      if (!info.State) {
        return ServiceStatus.Unknown;
      }
      
      if (info.State.Running) {
        return ServiceStatus.Running;
      } else if (info.State.Paused) {
        return ServiceStatus.Stopped;
      } else if (info.State.Restarting) {
        return ServiceStatus.Restarting;
      } else if (info.State.Status === 'restarting') {
        return ServiceStatus.Restarting;
      } else if (info.State.Status === 'exited' && info.State.ExitCode === 0) {
        // For one-time containers that completed successfully
        return ServiceStatus.Running; // Consider them as "running" (completed)
      } else {
        return ServiceStatus.Stopped;
      }
    } catch (error: any) {
      if (error.statusCode === 404) {
        return ServiceStatus.Stopped;
      }
      this.logger.error(`Failed to get status for service ${this.name}:`, error);
      return ServiceStatus.Unknown;
    }
  }
  
  /**
   * Alias for status() to match expected interface
   */
  async getStatus(): Promise<ServiceStatus> {
    return this.status();
  }
  
  /**
   * Get detailed container information
   */
  async getInfo(): Promise<any> {
    try {
      const containerName = `${this.projectName}-${this.name}-1`;
      const container = this.docker.getContainer(containerName);
      const info = await container.inspect();
      
      // Calculate uptime in seconds
      let uptime = 0;
      if (info.State?.StartedAt && info.State.Running) {
        const startTime = new Date(info.State.StartedAt).getTime();
        const now = Date.now();
        uptime = Math.floor((now - startTime) / 1000);
      }

      // Extract port mappings
      const ports = info.NetworkSettings?.Ports ? 
        Object.entries(info.NetworkSettings.Ports).flatMap(([privatePort, bindings]) => {
          if (!bindings || bindings.length === 0) return [];
          return bindings.map((binding: any) => ({
            PrivatePort: parseInt(privatePort.split('/')[0] || '0'),
            PublicPort: parseInt(binding.HostPort || '0'),
            Type: privatePort.split('/')[1] || 'tcp',
          }));
        }) : [];
      
      return {
        id: info.Id,
        name: info.Name,
        status: info.State?.Running ? 'running' : 'stopped',
        uptime,
        ports,
        networks: Object.keys(info.NetworkSettings?.Networks || {}),
        image: info.Config?.Image,
        created: info.Created,
      };
    } catch (error: any) {
      if (error.statusCode === 404) {
        return null;
      }
      this.logger.error(`Failed to get info for service ${this.name}:`, error);
      return null;
    }
  }

  /**
   * Get service logs
   */
  async *logs(options: LogOptions = {}): AsyncIterable<string> {
    const { follow = false, tail = 100, since, until, signal } = options;
    
    try {
      const containerName = `${this.projectName}-${this.name}-1`;
      const container = this.docker.getContainer(containerName);
      
      if (follow) {
        // For following logs, we need to specify follow: true explicitly
        const logOptions: Docker.ContainerLogsOptions & { follow: true } = {
          stdout: true,
          stderr: true,
          follow: true,
          tail: tail || 100,
          timestamps: true,
        };
        
        if (since) {
          logOptions.since = Math.floor(since.getTime() / 1000);
        }
        
        if (until) {
          logOptions.until = Math.floor(until.getTime() / 1000);
        }
        
        const stream = await container.logs(logOptions);
        
        // Handle as Node.js stream with abort signal support
        const readable = stream as NodeJS.ReadableStream;
        
        // Set up abort handling
        if (signal) {
          const abortHandler = () => {
            // Destroy the stream when aborted
            if ('destroy' in readable && typeof readable.destroy === 'function') {
              readable.destroy();
            }
            // Also try to unpipe to ensure complete cleanup
            if ('unpipe' in readable && typeof readable.unpipe === 'function') {
              readable.unpipe();
            }
            // Emit end to ensure iteration stops
            if ('emit' in readable && typeof readable.emit === 'function') {
              readable.emit('end');
            }
          };
          
          signal.addEventListener('abort', abortHandler, { once: true });
          
          // Clean up the handler if stream ends naturally
          readable.once('end', () => {
            signal.removeEventListener('abort', abortHandler);
          });
        }
        
        try {
          for await (const chunk of readable) {
            // Check if we should stop
            if (signal?.aborted) {
              break;
            }
            yield this.parseLogChunk(chunk as Buffer);
          }
        } catch (error: any) {
          // Ignore errors caused by stream destruction
          if (error.message?.includes('stream.push() after EOF') || 
              error.message?.includes('Premature close') ||
              error.code === 'ERR_STREAM_DESTROYED' ||
              signal?.aborted) {
            return;
          }
          throw error;
        } finally {
          // Ensure stream is cleaned up
          if ('destroy' in readable && typeof readable.destroy === 'function') {
            readable.destroy();
          }
        }
      } else {
        // For non-following logs, follow must be false or undefined
        const logOptions: Docker.ContainerLogsOptions & { follow: false } = {
          stdout: true,
          stderr: true,
          follow: false,
          tail: tail || 100,
          timestamps: true,
        };
        
        if (since) {
          logOptions.since = Math.floor(since.getTime() / 1000);
        }
        
        if (until) {
          logOptions.until = Math.floor(until.getTime() / 1000);
        }
        
        const buffer = await container.logs(logOptions);
        const logs = buffer.toString();
        const lines = logs.split('\n').filter(line => line.trim());
        for (const line of lines) {
          yield this.parseLogLine(line);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to get logs for service ${this.name}:`, error);
      throw error;
    }
  }

  /**
   * Get recent logs as a string (non-streaming)
   */
  async getLogs(options: { tail?: number } = {}): Promise<string> {
    const { tail = 50 } = options;
    
    try {
      const containerName = `${this.projectName}-${this.name}-1`;
      const container = this.docker.getContainer(containerName);
      
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        follow: false,
        tail,
        timestamps: false,
      } as Docker.ContainerLogsOptions & { follow: false });
      
      // Convert buffer to string
      if (Buffer.isBuffer(logs)) {
        return this.parseLogBuffer(logs);
      } else {
        return String(logs);
      }
    } catch (error) {
      this.logger.error(`Failed to get logs for service ${this.name}:`, error);
      return '';
    }
  }

  /**
   * Perform health check
   */
  async healthcheck(): Promise<HealthCheckResult> {
    try {
      const containerName = `${this.projectName}-${this.name}-1`;
      const container = this.docker.getContainer(containerName);
      const info = await container.inspect();
      
      if (!info.State) {
        return {
          healthy: false,
          message: 'no state information',
        };
      }
      
      // Check if this is a one-time container that has exited successfully
      if (info.State.Status === 'exited' && info.State.ExitCode === 0) {
        return {
          healthy: true,
          message: 'completed successfully',
        };
      }
      
      if (!info.State.Running) {
        return {
          healthy: false,
          message: `stopped (exit code: ${info.State.ExitCode || 'unknown'})`,
        };
      }
      
      // Check if container has health check
      if (info.State.Health) {
        const health = info.State.Health;
        return {
          healthy: health.Status === 'healthy',
          message: health.Status,
          details: {
            failingStreak: health.FailingStreak,
            log: health.Log,
          },
        };
      }
      
      // No health check configured, assume healthy if running
      return {
        healthy: true,
        message: 'Container is running (no health check configured)',
      };
    } catch (error: any) {
      if (error.statusCode === 404) {
        return {
          healthy: false,
          message: 'not found',
        };
      }
      
      this.logger.error(`Failed to perform health check for service ${this.name}:`, error);
      return {
        healthy: false,
        message: 'check failed',
        details: { error: error.message },
      };
    }
  }

  /**
   * Scale the service
   */
  async scale(replicas: number): Promise<void> {
    this.logger.info(`Scaling service ${this.name} to ${replicas} replicas`);
    
    try {
      await execDockerCompose([
        '-f', this.composeFile,
        '-p', this.projectName,
        'up', '-d', '--scale', `${this.name}=${replicas}`, this.name
      ]);
      
      this.logger.info(`Service ${this.name} scaled to ${replicas} replicas`);
    } catch (error) {
      this.logger.error(`Failed to scale service ${this.name}:`, error);
      throw error;
    }
  }

  /**
   * Execute a command in the container
   */
  async exec(command: string[]): Promise<string> {
    try {
      const containerName = `${this.projectName}-${this.name}-1`;
      const container = this.docker.getContainer(containerName);
      
      const exec = await container.exec({
        Cmd: command,
        AttachStdout: true,
        AttachStderr: true,
      });
      
      const stream = await exec.start({ Detach: false });
      
      return new Promise((resolve, reject) => {
        let output = '';
        
        stream.on('data', (chunk: Buffer) => {
          output += chunk.toString();
        });
        
        stream.on('end', () => {
          resolve(output);
        });
        
        stream.on('error', reject);
      });
    } catch (error) {
      this.logger.error(`Failed to execute command in service ${this.name}:`, error);
      throw error;
    }
  }

  /**
   * Get container stats
   */
  async stats(): Promise<any> {
    try {
      const containerName = `${this.projectName}-${this.name}-1`;
      const container = this.docker.getContainer(containerName);
      const stats = await container.stats({ stream: false });
      
      return {
        cpu: { percent: this.calculateCPUPercent(stats) },
        memory: this.calculateMemoryUsage(stats),
        network: stats.networks || { rx: 0, tx: 0 },
        disk: stats.blkio_stats || { read: 0, write: 0 },
      };
    } catch (error) {
      this.logger.error(`Failed to get stats for service ${this.name}:`, error);
      return {
        cpu: { percent: 0 },
        memory: { used: 0, limit: 0, percent: 0 },
        network: { rx: 0, tx: 0 },
        disk: { read: 0, write: 0 },
      };
    }
  }


  /**
   * Parse log line
   */
  private parseLogLine(line: string): string {
    // Remove Docker log prefix if present
    const match = line.match(/^\w{8}\s+(.+)$/);
    return match ? match[1] || line : line;
  }

  /**
   * Parse Docker log chunk (with header)
   */
  private parseLogChunk(chunk: Buffer): string {
    // Docker multiplexed stream format:
    // header := [8]byte{STREAM_TYPE, 0, 0, 0, SIZE1, SIZE2, SIZE3, SIZE4}
    if (chunk.length < 8) {
      return chunk.toString();
    }
    
    const header = chunk.slice(0, 8);
    const streamType = header[0]; // 1 = stdout, 2 = stderr
    const size = header.readUInt32BE(4);
    
    if (size > 0 && chunk.length >= 8 + size) {
      return chunk.slice(8, 8 + size).toString();
    }
    
    return chunk.toString();
  }

  /**
   * Parse Docker log buffer
   */
  private parseLogBuffer(buffer: Buffer): string {
    let result = '';
    let offset = 0;
    
    while (offset < buffer.length) {
      if (buffer.length - offset < 8) {
        // Not enough data for header
        result += buffer.slice(offset).toString();
        break;
      }
      
      const header = buffer.slice(offset, offset + 8);
      const streamType = header[0];
      const size = header.readUInt32BE(4);
      
      if (streamType === 1 || streamType === 2) {
        // Valid stream type
        if (buffer.length - offset >= 8 + size) {
          result += buffer.slice(offset + 8, offset + 8 + size).toString();
          offset += 8 + size;
        } else {
          // Not enough data
          result += buffer.slice(offset).toString();
          break;
        }
      } else {
        // Invalid header, treat as plain text
        result += buffer.slice(offset).toString();
        break;
      }
    }
    
    return result;
  }

  /**
   * Calculate CPU percentage from stats
   */
  private calculateCPUPercent(stats: any): number {
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const cpuCount = stats.cpu_stats.online_cpus || stats.cpu_stats.cpu_usage.percpu_usage?.length || 1;
    
    if (systemDelta > 0 && cpuDelta > 0) {
      return (cpuDelta / systemDelta) * cpuCount * 100;
    }
    
    return 0;
  }

  /**
   * Calculate memory usage from stats
   */
  private calculateMemoryUsage(stats: any): { used: number; limit: number; percent: number } {
    const used = stats.memory_stats.usage || 0;
    const limit = stats.memory_stats.limit || 0;
    const percent = limit > 0 ? (used / limit) * 100 : 0;
    
    return { used, limit, percent };
  }

  /**
   * Static method to create adapters from docker-compose config
   */
  static async createFromCompose(
    composeFile: string,
    projectName: string,
    logger: Logger
  ): Promise<DockerAdapter[]> {
    const content = await readFile(composeFile, 'utf-8');
    const config = yaml.load(content) as DockerComposeConfig;
    
    if (!config.services) {
      throw new Error('No services found in docker-compose file');
    }
    
    const adapters: DockerAdapter[] = [];
    
    for (const serviceName of Object.keys(config.services)) {
      const adapter = new DockerAdapter({
        serviceName,
        composeFile,
        projectName,
        logger,
      });
      adapters.push(adapter);
    }
    
    return adapters;
  }
  
  /**
   * Alias for createFromCompose for backward compatibility
   */
  static async fromCompose(
    composeFile: string,
    projectName: string,
    logger: Logger
  ): Promise<DockerAdapter[]> {
    return DockerAdapter.createFromCompose(composeFile, projectName, logger);
  }
}