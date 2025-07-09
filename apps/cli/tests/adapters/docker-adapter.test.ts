/**
 * Docker Adapter tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DockerAdapter } from '../../src/adapters/docker-adapter.js';
import { ServiceStatus } from '../../src/types/index.js';
import { LoggerImpl } from '../../src/core/logger.js';
import Docker from 'dockerode';

// Mock dockerode
vi.mock('dockerode');

// Mock execa
vi.mock('execa', () => ({
  execa: vi.fn(() => Promise.resolve({
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
            supastor: {},
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
          Status: 'Up 5 minutes',
        },
      ]),
    };

    // Mock Docker constructor
    vi.mocked(Docker).mockImplementation(() => mockDocker);

    logger = new LoggerImpl();
    vi.spyOn(logger, 'info').mockImplementation(() => {});
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.spyOn(logger, 'debug').mockImplementation(() => {});

    dockerAdapter = new DockerAdapter({
      serviceName: 'postgres',
      composeFile: './docker-compose.yml',
      projectName: 'supastor',
      logger,
    });
  });

  describe('Service Lifecycle', () => {
    
    it('should start a service', async () => {
      const { execa } = await import('execa');
      await dockerAdapter.start();
      
      expect(execa).toHaveBeenCalledWith('docker-compose', [
        '-f', './docker-compose.yml',
        '-p', 'supastor',
        'up', '-d', 'postgres'
      ]);
      expect(logger.info).toHaveBeenCalledWith('Service started: postgres');
    });

    it('should stop a service', async () => {
      const { execa } = await import('execa');
      await dockerAdapter.stop();
      
      expect(execa).toHaveBeenCalledWith('docker-compose', [
        '-f', './docker-compose.yml',
        '-p', 'supastor',
        'stop', 'postgres'
      ]);
      expect(logger.info).toHaveBeenCalledWith('Service stopped: postgres');
    });

    it('should restart a service', async () => {
      const { execa } = await import('execa');
      await dockerAdapter.restart();
      
      expect(execa).toHaveBeenCalledWith('docker-compose', [
        '-f', './docker-compose.yml',
        '-p', 'supastor',
        'restart', 'postgres'
      ]);
      expect(logger.info).toHaveBeenCalledWith('Service restarted: postgres');
    });

    it('should handle start errors', async () => {
      const { execa } = await import('execa');
      vi.mocked(execa).mockRejectedValueOnce(new Error('Docker error'));
      
      await expect(dockerAdapter.start()).rejects.toThrow('Docker error');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('Service Status', () => {
    it('should get running status', async () => {
      const status = await dockerAdapter.status();
      expect(status).toBe(ServiceStatus.Running);
    });

    it('should get stopped status', async () => {
      mockContainer.inspect.mockResolvedValue({
        State: {
          Running: false,
          Status: 'exited',
        },
      });
      
      const status = await dockerAdapter.status();
      expect(status).toBe(ServiceStatus.Stopped);
    });

    it('should handle missing container', async () => {
      mockDocker.getContainer.mockImplementation(() => ({
        inspect: vi.fn().mockRejectedValue({ statusCode: 404 }),
      }));
      
      const status = await dockerAdapter.status();
      expect(status).toBe(ServiceStatus.Stopped);
    });

    it('should get container info', async () => {
      const info = await dockerAdapter.getInfo();
      expect(info).toBeDefined();
      expect(info.name).toBe('/supastor_postgres_1');
      expect(info.status).toBe('running');
      expect(info.ports).toHaveLength(1);
      expect(info.ports[0]).toEqual({
        PrivatePort: 5432,
        PublicPort: 5432,
        Type: 'tcp',
      });
    });
  });

  describe('Health Checks', () => {
    it('should report healthy container', async () => {
      const health = await dockerAdapter.healthcheck();
      expect(health.healthy).toBe(true);
      expect(health.message).toContain('running');
    });

    it('should report unhealthy container', async () => {
      mockContainer.inspect.mockResolvedValue({
        State: {
          Running: false,
        },
      });
      
      const health = await dockerAdapter.healthcheck();
      expect(health.healthy).toBe(false);
      expect(health.message).toBe('Container is not running');
    });

    it('should report health check status', async () => {
      mockContainer.inspect.mockResolvedValue({
        State: {
          Running: true,
          Health: {
            Status: 'healthy',
            FailingStreak: 0,
            Log: [],
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
      const mockBuffer = Buffer.from('test log line');
      mockContainer.logs.mockResolvedValue(mockBuffer);
      
      const logs = [];
      for await (const line of dockerAdapter.logs({ follow: false })) {
        logs.push(line);
      }
      
      expect(mockContainer.logs).toHaveBeenCalledWith({
        stdout: true,
        stderr: true,
        follow: false,
        tail: 100,
        timestamps: true,
      });
      expect(logs).toHaveLength(1);
    });

    it('should follow logs', async () => {
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from('\x00\x00\x00\x00\x00\x00\x00\x08log line 1');
          yield Buffer.from('\x00\x00\x00\x00\x00\x00\x00\x08log line 2');
        },
      };
      mockContainer.logs.mockResolvedValue(mockStream);
      
      const logs = [];
      for await (const line of dockerAdapter.logs({ follow: true, tail: 10 })) {
        logs.push(line);
        if (logs.length >= 2) break;
      }
      
      expect(mockContainer.logs).toHaveBeenCalledWith({
        stdout: true,
        stderr: true,
        follow: true,
        tail: 10,
        timestamps: true,
      });
      expect(logs).toHaveLength(2);
    });
  });

  describe('Stats', () => {
    it('should get container stats', async () => {
      const stats = await dockerAdapter.stats();
      expect(stats).toBeDefined();
      expect(stats.cpu).toBeDefined();
      expect(stats.memory).toBeDefined();
      expect(stats.memory.percent).toBeLessThan(100);
    });

    it('should handle stats errors', async () => {
      mockContainer.stats.mockRejectedValue(new Error('Stats error'));
      
      const stats = await dockerAdapter.stats();
      expect(stats).toEqual({
        cpu: { percent: 0 },
        memory: { used: 0, limit: 0, percent: 0 },
        network: { rx: 0, tx: 0 },
        disk: { read: 0, write: 0 },
      });
    });
  });

  describe('Scaling', () => {
    it('should scale service', async () => {
      const { execa } = await import('execa');
      await dockerAdapter.scale(3);
      
      expect(execa).toHaveBeenCalledWith('docker-compose', [
        '-f', './docker-compose.yml',
        '-p', 'supastor',
        'up', '-d', '--scale', 'postgres=3', 'postgres'
      ]);
    });
  });

  describe('Command Execution', () => {
    it('should execute command in container', async () => {
      const mockStream = {
        on: vi.fn((event, handler) => {
          if (event === 'data') {
            setTimeout(() => handler(Buffer.from('command output')), 0);
          } else if (event === 'end') {
            setTimeout(() => handler(), 10);
          }
        }),
      };
      
      const mockExec = {
        start: vi.fn().mockResolvedValue(mockStream),
      };
      mockContainer.exec.mockResolvedValue(mockExec);
      
      const output = await dockerAdapter.exec(['echo', 'test']);
      expect(output).toContain('command output');
    });
  });

  describe('Static Methods', () => {
    it('should create adapters from compose file', async () => {
      const adapters = await DockerAdapter.fromCompose(
        './docker-compose.yml',
        'supastor',
        logger
      );
      
      expect(adapters).toHaveLength(2);
      expect(adapters[0].name).toBe('postgres');
      expect(adapters[1].name).toBe('storage');
    });

    it('should handle invalid compose file', async () => {
      const { readFile } = await import('fs/promises');
      vi.mocked(readFile).mockResolvedValue('invalid yaml content {');
      
      await expect(
        DockerAdapter.fromCompose('./invalid.yml', 'supastor', logger)
      ).rejects.toThrow();
    });
  });
});