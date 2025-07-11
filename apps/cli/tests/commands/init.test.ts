/**
 * Init command tests
 */

import * as fs from 'fs/promises';
import * as prompts from '@clack/prompts';
import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { LoggerImpl } from '../../src/core/logger.js';
import { initCommand } from '../../src/commands/init/index.js';
import { CommandContext } from '../../src/types/index.js';
import { EventBusImpl } from '../../src/core/event-bus.js';
import { ConfigManager } from '../../src/config/config-manager.js';

vi.mock('fs/promises');
vi.mock('@clack/prompts');

describe('Init Command', () => {
  let context: CommandContext;
  let consoleLogSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    context = {
      config: ConfigManager.generateDefault(),
      environment: 'development',
      logger: new LoggerImpl(),
      eventBus: new EventBusImpl(),
    };

    // Mock logger methods
    vi.spyOn(context.logger, 'info').mockImplementation(() => {});
    vi.spyOn(context.logger, 'error').mockImplementation(() => {});
    vi.spyOn(context.logger, 'debug').mockImplementation(() => {});
    vi.spyOn(context.logger, 'warn').mockImplementation(() => {});
    vi.spyOn(context.logger, 'audit').mockImplementation(() => {});

    // Mock console
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Mock file operations
    vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.copyFile).mockResolvedValue(undefined);

    // Mock prompts
    vi.mocked(prompts.intro).mockImplementation(() => {});
    vi.mocked(prompts.outro).mockImplementation(() => {});
    vi.mocked(prompts.text).mockResolvedValue('supastorj');
    vi.mocked(prompts.select).mockResolvedValue('development');
    vi.mocked(prompts.confirm).mockResolvedValue(true);
    vi.mocked(prompts.spinner).mockReturnValue({
      start: vi.fn(),
      stop: vi.fn(),
      message: '',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct command definition', () => {
    expect(initCommand.name).toBe('init');
    expect(initCommand.description).toContain('Initialize');
    expect(initCommand.options).toHaveLength(3);
  });

  it('should initialize a new project with default settings', async () => {
    const options = { force: false, yes: true, skipEnv: false };
    
    await initCommand.action(context, options);

    // Should create configuration file
    expect(fs.writeFile).toHaveBeenCalledWith(
      './supastorj.config.yaml',
      expect.stringContaining("version: '1.0'"),
      'utf-8'
    );

    // Should create .env file
    expect(fs.writeFile).toHaveBeenCalledWith(
      './.env',
      expect.stringContaining('PROJECT_NAME=supastorj'),
      'utf-8'
    );

    // Should use file backend by default
    expect(fs.writeFile).toHaveBeenCalledWith(
      './.env',
      expect.stringContaining('STORAGE_BACKEND=file'),
      'utf-8'
    );

    // Should create .env.example
    expect(fs.writeFile).toHaveBeenCalledWith(
      '.env.example',
      expect.stringContaining('PROJECT_NAME=supastorj'),
      'utf-8'
    );

    // Should create directories
    expect(fs.mkdir).toHaveBeenCalledWith('./data/postgres', { recursive: true });
    expect(fs.mkdir).toHaveBeenCalledWith('./data/storage', { recursive: true });
    expect(fs.mkdir).toHaveBeenCalledWith('./logs', { recursive: true });
    expect(fs.mkdir).toHaveBeenCalledWith('./templates', { recursive: true });
    expect(fs.mkdir).toHaveBeenCalledWith('./plugins', { recursive: true });

    // Should create .gitignore
    expect(fs.writeFile).toHaveBeenCalledWith(
      '.gitignore',
      expect.stringContaining('.env'),
      'utf-8'
    );

    // Should create README.md
    expect(fs.writeFile).toHaveBeenCalledWith(
      'README.md',
      expect.stringContaining('supastorj'),
      'utf-8'
    );

    // Should copy docker-compose files
    expect(fs.copyFile).toHaveBeenCalledTimes(3);

    // Should log audit event
    expect(context.logger.audit).toHaveBeenCalledWith('project_initialized', {
      projectName: 'supastorj',
      environment: 'development',
      configPath: './supastorj.config.yaml',
    });
  });

  it('should prompt for project name, environment, and storage backend when not using --yes', async () => {
    const options = { force: false, yes: false, skipEnv: false };
    
    vi.mocked(prompts.text).mockResolvedValue('my-project');
    vi.mocked(prompts.select)
      .mockResolvedValueOnce('production')
      .mockResolvedValueOnce('s3');
    
    await initCommand.action(context, options);

    expect(prompts.text).toHaveBeenCalledWith({
      message: 'Project name:',
      placeholder: 'supastorj',
      defaultValue: 'supastorj',
    });

    expect(prompts.select).toHaveBeenCalledWith({
      message: 'Default environment:',
      options: expect.arrayContaining([
        { value: 'development', label: 'Development' },
        { value: 'staging', label: 'Staging' },
        { value: 'production', label: 'Production' },
      ]),
    });

    expect(prompts.select).toHaveBeenCalledWith({
      message: 'Storage backend:',
      options: [
        { value: 'file', label: 'File System (local storage)' },
        { value: 's3', label: 'S3 Compatible (MinIO)' },
      ],
    });

    // Should use custom project name
    expect(fs.writeFile).toHaveBeenCalledWith(
      './.env',
      expect.stringContaining('PROJECT_NAME=my-project'),
      'utf-8'
    );
    
    // Should have s3 backend configured
    expect(fs.writeFile).toHaveBeenCalledWith(
      './.env',
      expect.stringContaining('STORAGE_BACKEND=s3'),
      'utf-8'
    );
  });

  it('should skip existing files without --force', async () => {
    const options = { force: false, yes: false, skipEnv: false };
    
    // Mock existing files
    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(prompts.confirm).mockResolvedValue(false);
    
    await initCommand.action(context, options);

    expect(prompts.confirm).toHaveBeenCalledWith({
      message: 'Configuration files already exist. Overwrite?',
      initialValue: false,
    });

    // Should not write any files
    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(prompts.outro).toHaveBeenCalledWith(expect.stringContaining('cancelled'));
  });

  it('should overwrite existing files with --force', async () => {
    const options = { force: true, yes: true, skipEnv: false };
    
    // Mock existing files
    vi.mocked(fs.access).mockResolvedValue(undefined);
    
    await initCommand.action(context, options);

    // Should not prompt for confirmation
    expect(prompts.confirm).not.toHaveBeenCalled();

    // Should write files
    expect(fs.writeFile).toHaveBeenCalled();
  });

  it('should skip env file generation with --skip-env', async () => {
    const options = { force: false, yes: true, skipEnv: true };
    
    await initCommand.action(context, options);

    // Should create config file
    expect(fs.writeFile).toHaveBeenCalledWith(
      './supastorj.config.yaml',
      expect.any(String),
      'utf-8'
    );

    // Should NOT create .env files
    expect(fs.writeFile).not.toHaveBeenCalledWith(
      './.env',
      expect.any(String),
      'utf-8'
    );
    expect(fs.writeFile).not.toHaveBeenCalledWith(
      '.env.example',
      expect.any(String),
      'utf-8'
    );
  });

  it('should generate secure random keys', async () => {
    const options = { force: false, yes: true, skipEnv: false };
    
    await initCommand.action(context, options);

    const envCall = vi.mocked(fs.writeFile).mock.calls.find(
      call => call[0] === './.env'
    );
    const envContent = envCall?.[1] as string;

    // Check that keys are generated and not empty
    expect(envContent).toMatch(/ANON_KEY=[\w+/=]+/);
    expect(envContent).toMatch(/SERVICE_KEY=[\w+/=]+/);
    expect(envContent).toMatch(/JWT_SECRET=[\w]+/);
    expect(envContent).toMatch(/POSTGRES_PASSWORD=[\w+/=]+/);
    expect(envContent).toMatch(/REDIS_PASSWORD=[\w+/=]+/);
  });

  it('should not include MinIO settings for file backend', async () => {
    const options = { force: false, yes: true, skipEnv: false };
    
    await initCommand.action(context, options);

    const envCall = vi.mocked(fs.writeFile).mock.calls.find(
      call => call[0] === './.env'
    );
    const envContent = envCall?.[1] as string;

    // Should not have MinIO settings for file backend
    expect(envContent).not.toContain('MINIO_ROOT_USER');
    expect(envContent).not.toContain('MINIO_ROOT_PASSWORD');
    expect(envContent).not.toContain('AWS_ACCESS_KEY_ID');
    expect(envContent).not.toContain('AWS_SECRET_ACCESS_KEY');
  });

  it('should include MinIO settings for s3 backend', async () => {
    const options = { force: false, yes: false, skipEnv: false };
    
    vi.mocked(prompts.text).mockResolvedValue('my-project');
    vi.mocked(prompts.select)
      .mockResolvedValueOnce('development')
      .mockResolvedValueOnce('s3');
    
    await initCommand.action(context, options);

    const envCall = vi.mocked(fs.writeFile).mock.calls.find(
      call => call[0] === './.env'
    );
    const envContent = envCall?.[1] as string;

    // Should have MinIO settings for s3 backend
    expect(envContent).toContain('MINIO_ROOT_USER=supastorj');
    expect(envContent).toMatch(/MINIO_ROOT_PASSWORD=[\w+/=]+/);
    expect(envContent).toContain('AWS_ACCESS_KEY_ID=supastorj');
    expect(envContent).toMatch(/AWS_SECRET_ACCESS_KEY=[\w+/=]+/);
  });

  it('should mask secrets in .env.example', async () => {
    const options = { force: false, yes: true, skipEnv: false };
    
    await initCommand.action(context, options);

    const exampleCall = vi.mocked(fs.writeFile).mock.calls.find(
      call => call[0] === '.env.example'
    );
    const exampleContent = exampleCall?.[1] as string;

    // Check that secrets are masked
    expect(exampleContent).toContain('ANON_KEY=<your-secret-here>');
    expect(exampleContent).toContain('SERVICE_KEY=<your-secret-here>');
    expect(exampleContent).toContain('JWT_SECRET=<your-secret-here>');
    expect(exampleContent).toContain('POSTGRES_PASSWORD=<your-secret-here>');
    expect(exampleContent).toContain('REDIS_PASSWORD=<your-secret-here>');
  });

  it('should handle errors during initialization', async () => {
    const options = { force: false, yes: true, skipEnv: false };
    
    // Mock write error
    vi.mocked(fs.writeFile).mockRejectedValue(new Error('Write failed'));
    
    await expect(initCommand.action(context, options)).rejects.toThrow('Write failed');
  });

  it('should handle missing docker-compose templates gracefully', async () => {
    const options = { force: false, yes: true, skipEnv: false };
    
    // Mock copy error for docker-compose files
    vi.mocked(fs.copyFile).mockRejectedValue(new Error('File not found'));
    
    await initCommand.action(context, options);

    // Should log warnings but not throw
    expect(context.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to copy'),
      expect.any(Error)
    );
  });
});