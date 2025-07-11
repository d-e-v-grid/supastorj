import { join } from 'path';
import * as yaml from 'js-yaml';
import { readFile } from 'fs/promises';
import { it, expect, describe, beforeEach } from 'vitest';

describe('Docker Compose Configuration', () => {
  const templatePath = join(__dirname, '../templates/docker-compose.yml');
  let dockerComposeConfig: any;

  beforeEach(async () => {
    const content = await readFile(templatePath, 'utf-8');
    dockerComposeConfig = yaml.load(content) as any;
  });

  describe('PostgreSQL Configuration', () => {
    it('should have correct PostgreSQL image', () => {
      const postgres = dockerComposeConfig.services.postgres;
      expect(postgres.image).toBe('postgres:16-alpine');
    });

    it('should expose PostgreSQL on correct port', () => {
      const postgres = dockerComposeConfig.services.postgres;
      expect(postgres.ports[0]).toBe('127.0.0.1:${POSTGRES_PORT:-5432}:5432');
    });

    it('should have health check configured', () => {
      const postgres = dockerComposeConfig.services.postgres;
      expect(postgres.healthcheck).toBeDefined();
      expect(postgres.healthcheck.test).toBeDefined();
      expect(postgres.healthcheck.interval).toBe('5s');
    });

    it('should have correct environment variables', () => {
      const postgres = dockerComposeConfig.services.postgres;
      expect(postgres.environment.POSTGRES_DB).toBe('postgres');
      expect(postgres.environment.POSTGRES_USER).toBe('postgres');
      expect(postgres.environment.POSTGRES_PASSWORD).toBe('postgres');
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

    it('should mount storage volume', () => {
      const imgproxy = dockerComposeConfig.services.imgproxy;
      expect(imgproxy.volumes[0]).toBe('./data:/images/data');
    });
  });

  describe('Network Configuration', () => {
    it('should have supastorj network defined', () => {
      expect(dockerComposeConfig.networks.supastorj).toBeDefined();
      expect(dockerComposeConfig.networks.supastorj.driver).toBe('bridge');
    });

    it('all services should be on supastorj network', () => {
      const services = Object.values(dockerComposeConfig.services) as any[];
      const servicesWithNetwork = services.filter(s => s.networks);
      
      servicesWithNetwork.forEach(service => {
        expect(service.networks).toContain('supastorj');
      });
    });
  });

  describe('Volumes', () => {
    it('should not define volumes at top level', () => {
      // The template doesn't define volumes at the top level
      expect(dockerComposeConfig.volumes).toBeUndefined();
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