/**
 * Docker Adapter tests
 */

import Docker from 'dockerode';
import { it, vi, expect, describe, beforeEach } from 'vitest';

import { LoggerImpl } from '../../src/core/logger.js';
import { ServiceStatus } from '../../src/types/index.js';
import { DockerAdapter } from '../../src/adapters/docker-adapter.js';

// Mock dockerode
vi.mock('dockerode');

// Mock docker-compose utils
vi.mock('../../src/utils/docker-compose.js', () => ({
  execDockerCompose: vi.fn(() => Promise.resolve({
    stdout: '',
    stderr: '',
    exitCode: 0,
  })),
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(`
version: "3.9"
services:
  postgres:
    image: postgres:16
    ports:
      - "5432:5432"
  storage:
    image: supabase/storage-api:latest
    ports:
      - "5000:5000"
`),
}));

describe('DockerAdapter', () => {
  let dockerAdapter: DockerAdapter;
  let mockDocker: any;
  let mockContainer: any;
  let logger: LoggerImpl;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock container object
    mockContainer = {
      inspect: vi.fn().mockResolvedValue({
        State: {
          Running: true,
          Status: 'running',
          StartedAt: new Date().toISOString(),
        },
        NetworkSettings: {
          Ports: {
            '5432/tcp': [{ HostPort: '5432' }],
          },
          Networks: {
            supastorj: {},
          },
        },
        Config: {
          Image: 'postgres:16',
        },
        Id: 'mock-container-id',
        Name: '/supastor_postgres_1',
        Created: new Date().toISOString(),
      }),
      stats: vi.fn().mockResolvedValue({
        read: new Date().toISOString(),
        cpu_stats: {
          cpu_usage: {
            total_usage: 1000000,
          },
          system_cpu_usage: 10000000,
          online_cpus: 4,
        },
        precpu_stats: {
          cpu_usage: {
            total_usage: 900000,
          },
          system_cpu_usage: 9000000,
        },
        memory_stats: {
          usage: 50 * 1024 * 1024, // 50MB
          limit: 1024 * 1024 * 1024, // 1GB
        },
      }),
      logs: vi.fn(),
      exec: vi.fn(),
    };

    // Mock Docker instance
    mockDocker = {
      getContainer: vi.fn().mockReturnValue(mockContainer),
      listContainers: vi.fn().mockResolvedValue([
        {
          Id: 'mock-container-id',
          Names: ['/supastor_postgres_1'],
          State: 'running',
          Status: 'Up 2 hours',
          Created: Date.now() / 1000,
        },
      ]),
    };

    vi.mocked(Docker).mockImplementation(() => mockDocker as any);

    logger = new LoggerImpl();
    vi.spyOn(logger, 'info').mockImplementation(() => {});
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.spyOn(logger, 'warn').mockImplementation(() => {});

    dockerAdapter = new DockerAdapter({
      serviceName: 'postgres',
      logger,
    });
  });

  describe('Service Lifecycle', () => {
    it('should start a service', async () => {
      const { execDockerCompose } = await import('../../src/utils/docker-compose.js');

      await dockerAdapter.start();

      expect(execDockerCompose).toHaveBeenCalledWith([
        '-f', './docker-compose.yml',
        '-p', 'supastorj',
        'up', '-d', 'postgres'
      ]);
      expect(logger.info).toHaveBeenCalledWith('Starting service: postgres');
      expect(logger.info).toHaveBeenCalledWith('Service started: postgres');
    });

    it('should stop a service', async () => {
      const { execDockerCompose } = await import('../../src/utils/docker-compose.js');

      await dockerAdapter.stop();

      expect(execDockerCompose).toHaveBeenCalledWith([
        '-f', './docker-compose.yml',
        '-p', 'supastorj',
        'stop', 'postgres'
      ]);
      expect(logger.info).toHaveBeenCalledWith('Stopping service: postgres');
      expect(logger.info).toHaveBeenCalledWith('Service stopped: postgres');
    });

    it('should restart a service', async () => {
      const { execDockerCompose } = await import('../../src/utils/docker-compose.js');

      await dockerAdapter.restart();

      expect(execDockerCompose).toHaveBeenCalledWith([
        '-f', './docker-compose.yml',
        '-p', 'supastorj',
        'restart', 'postgres'
      ]);
      expect(logger.info).toHaveBeenCalledWith('Restarting service: postgres');
      expect(logger.info).toHaveBeenCalledWith('Service restarted: postgres');
    });

    it('should handle start errors', async () => {
      const { execDockerCompose } = await import('../../src/utils/docker-compose.js');
      vi.mocked(execDockerCompose).mockRejectedValueOnce(new Error('Docker error'));
      
      await expect(dockerAdapter.start()).rejects.toThrow('Docker error');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('Service Status', () => {
    it('should get running status', async () => {
      const status = await dockerAdapter.getStatus();
      expect(status).toBe(ServiceStatus.Running);
    });

    it('should get stopped status', async () => {
      mockContainer.inspect.mockResolvedValueOnce({
        State: {
          Running: false,
          Status: 'exited',
          ExitCode: 1, // Non-zero exit code for stopped status
          StartedAt: new Date().toISOString(),
          FinishedAt: new Date().toISOString(),
        },
      });

      const status = await dockerAdapter.getStatus();
      expect(status).toBe(ServiceStatus.Stopped);
    });

    it('should handle missing container', async () => {
      mockContainer.inspect.mockRejectedValueOnce({ statusCode: 404 });
      const status = await dockerAdapter.getStatus();
      expect(status).toBe(ServiceStatus.Stopped);
    });

    it('should get container info', async () => {
      const info = await dockerAdapter.getInfo();
      expect(info).toBeDefined();
      expect(info?.id).toBe('mock-container-id');
      expect(info?.image).toBe('postgres:16');
      expect(info?.status).toBe('running');
    });
  });

  describe('Health Checks', () => {
    it('should report healthy container', async () => {
      const health = await dockerAdapter.healthcheck();
      expect(health.healthy).toBe(true);
    });

    it('should report unhealthy container', async () => {
      mockContainer.inspect.mockResolvedValueOnce({
        State: {
          Running: false,
          Status: 'exited',
          ExitCode: 1,
        },
      });

      const health = await dockerAdapter.healthcheck();
      expect(health.healthy).toBe(false);
      expect(health.message).toBe('stopped (exit code: 1)');
    });

    it('should report health check status', async () => {
      mockContainer.inspect.mockResolvedValueOnce({
        State: {
          Running: true,
          Health: {
            Status: 'healthy',
          },
        },
      });

      const health = await dockerAdapter.healthcheck();
      expect(health.healthy).toBe(true);
      expect(health.message).toBe('healthy');
    });
  });

  describe('Logs', () => {
    it('should get logs without following', async () => {
      mockContainer.logs.mockResolvedValueOnce(Buffer.from('test log line\n'));

      const logs: string[] = [];
      for await (const log of dockerAdapter.logs({ follow: false })) {
        logs.push(log);
      }

      expect(mockContainer.logs).toHaveBeenCalledWith({
        stdout: true,
        stderr: true,
        follow: false,
        tail: 100,
        timestamps: true,
      });
      expect(logs).toHaveLength(1);
      expect(logs[0]).toBe('test log line');
    });

    it('should follow logs', async () => {
      const mockStream = {
        async *[Symbol.asyncIterator] () {
          yield Buffer.from('test log 1\n');
          yield Buffer.from('test log 2\n');
        },
        once: vi.fn(),
        destroy: vi.fn(),
      };
      mockContainer.logs.mockResolvedValueOnce(mockStream);

      const logs: string[] = [];
      let count = 0;
      for await (const log of dockerAdapter.logs({ follow: true })) {
        logs.push(log);
        count++;
        if (count >= 2) break; // Stop after 2 logs
      }

      expect(mockContainer.logs).toHaveBeenCalledWith({
        stdout: true,
        stderr: true,
        follow: true,
        tail: 100,
        timestamps: true,
      });
      expect(logs).toHaveLength(2);
    });
  });

  describe('Stats', () => {
    it('should get container stats', async () => {
      const stats = await dockerAdapter.stats();
      expect(stats).toBeDefined();
      expect(stats?.cpu?.percent).toBeGreaterThan(0);
      expect(stats?.memory?.used).toBe(50 * 1024 * 1024);
      expect(stats?.memory?.limit).toBe(1024 * 1024 * 1024);
    });

    it('should handle stats errors', async () => {
      mockContainer.stats.mockRejectedValueOnce(new Error('Stats error'));
      const stats = await dockerAdapter.stats();
      expect(stats).toBeDefined();
      expect(stats?.cpu?.percent).toBe(0);
      expect(stats?.memory?.used).toBe(0);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('Scaling', () => {
    it('should scale service', async () => {
      const { execDockerCompose } = await import('../../src/utils/docker-compose.js');

      await dockerAdapter.scale(3);

      expect(execDockerCompose).toHaveBeenCalledWith([
        '-f', './docker-compose.yml',
        '-p', 'supastorj',
        'up', '-d', '--scale', 'postgres=3', 'postgres'
      ]);
    });
  });

  describe('Command Execution', () => {
    it('should execute command in container', async () => {
      const mockStream = {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            callback(Buffer.from('test output'));
          } else if (event === 'end') {
            callback();
          }
          return mockStream;
        }),
      };
      
      const mockExecInstance = {
        start: vi.fn().mockResolvedValue(mockStream),
      };
      mockContainer.exec.mockResolvedValueOnce(mockExecInstance);

      const result = await dockerAdapter.exec(['echo', 'test']);
      expect(mockContainer.exec).toHaveBeenCalledWith({
        Cmd: ['echo', 'test'],
        AttachStdout: true,
        AttachStderr: true,
      });
      expect(result).toBe('test output');
    });
  });

  describe('Static Methods', () => {
    it('should create adapters from compose file', async () => {
      const adapters = await DockerAdapter.fromCompose(
        './docker-compose.yml',
        'test-project',
        logger
      );

      expect(adapters).toHaveLength(2);
      expect(adapters[0].name).toBe('postgres');
      expect(adapters[1].name).toBe('storage');
    });

    it('should handle invalid compose file', async () => {
      const { readFile } = await import('fs/promises');
      vi.mocked(readFile).mockResolvedValueOnce('invalid yaml');

      await expect(
        DockerAdapter.fromCompose('./invalid.yml', 'test', logger)
      ).rejects.toThrow();
    });
  });
});