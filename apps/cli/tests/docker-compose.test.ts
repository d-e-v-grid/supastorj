import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFile } from 'fs/promises';
import { join } from 'path';
import * as yaml from 'js-yaml';

describe('Docker Compose Configuration', () => {
  const templatePath = join(__dirname, '../templates/docker-compose.yml');
  let dockerComposeConfig: any;

  beforeEach(async () => {
    const content = await readFile(templatePath, 'utf-8');
    dockerComposeConfig = yaml.load(content) as any;
  });

  describe('PostgreSQL Configuration', () => {
    it('should have correct authentication method', () => {
      const postgres = dockerComposeConfig.services.postgres;
      expect(postgres.environment.POSTGRES_HOST_AUTH_METHOD).toBe('trust');
    });

    it('should expose PostgreSQL on correct port', () => {
      const postgres = dockerComposeConfig.services.postgres;
      expect(postgres.ports[0]).toMatch(/5432:5432/);
    });

    it('should have health check configured', () => {
      const postgres = dockerComposeConfig.services.postgres;
      expect(postgres.healthcheck).toBeDefined();
      expect(postgres.healthcheck.test).toBeDefined();
      expect(postgres.healthcheck.interval).toBe('5s');
    });

    it('should listen on all addresses', () => {
      const postgres = dockerComposeConfig.services.postgres;
      expect(postgres.command).toContain("listen_addresses='*'");
    });
  });

  describe('Storage API Configuration', () => {
    it('should use latest image', () => {
      const storage = dockerComposeConfig.services.storage;
      expect(storage.image).toBe('supabase/storage-api:latest');
    });

    it('should depend on postgres health', () => {
      const storage = dockerComposeConfig.services.storage;
      expect(storage.depends_on.postgres.condition).toBe('service_healthy');
    });

    it('should have DATABASE_URL configured', () => {
      const storage = dockerComposeConfig.services.storage;
      expect(storage.environment.DATABASE_URL).toContain('postgres:5432');
    });
  });

  describe('Postgres Meta Configuration', () => {
    it('should use specific version', () => {
      const postgresMeta = dockerComposeConfig.services['postgres-meta'];
      expect(postgresMeta.image).toMatch(/supabase\/postgres-meta:v\d+\.\d+\.\d+/);
    });

    it('should connect to postgres service', () => {
      const postgresMeta = dockerComposeConfig.services['postgres-meta'];
      expect(postgresMeta.environment.PG_META_DB_HOST).toBe('postgres');
    });
  });

  describe('ImgProxy Configuration', () => {
    it('should be in profiles for optional deployment', () => {
      const imgproxy = dockerComposeConfig.services.imgproxy;
      expect(imgproxy.profiles).toContain('imgproxy');
    });

    it('should mount storage volume as read-only', () => {
      const imgproxy = dockerComposeConfig.services.imgproxy;
      expect(imgproxy.volumes[0]).toContain(':ro');
    });
  });

  describe('Network Configuration', () => {
    it('should have supastor network defined', () => {
      expect(dockerComposeConfig.networks.supastor).toBeDefined();
      expect(dockerComposeConfig.networks.supastor.driver).toBe('bridge');
    });

    it('all services should be on supastor network', () => {
      const services = Object.values(dockerComposeConfig.services) as any[];
      const servicesWithNetwork = services.filter(s => s.networks);
      
      servicesWithNetwork.forEach(service => {
        expect(service.networks).toContain('supastor');
      });
    });
  });

  describe('Volumes', () => {
    it('should define required volumes', () => {
      expect(dockerComposeConfig.volumes.postgres_data).toBeDefined();
      expect(dockerComposeConfig.volumes.storage_data).toBeDefined();
    });
  });

  describe('Service Dependencies', () => {
    it('storage should wait for postgres and minio setup', () => {
      const storage = dockerComposeConfig.services.storage;
      expect(storage.depends_on.postgres.condition).toBe('service_healthy');
      expect(storage.depends_on.minio_setup.condition).toBe('service_completed_successfully');
    });

    it('postgres-meta should wait for postgres', () => {
      const postgresMeta = dockerComposeConfig.services['postgres-meta'];
      expect(postgresMeta.depends_on.postgres.condition).toBe('service_healthy');
    });
  });
});