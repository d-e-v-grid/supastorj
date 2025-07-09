import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rm, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtemp } from 'fs/promises';
import { initCommand } from '../../src/commands/init.js';
import { LoggerImpl } from '../../src/core/logger.js';
import { EventBusImpl } from '../../src/core/event-bus.js';
import { Environment } from '../../src/types/index.js';

describe('Init Command - Image Transform', () => {
  let tempDir: string;
  let originalCwd: string;
  let context: any;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await mkdtemp(join(tmpdir(), 'supastor-test-'));
    process.chdir(tempDir);
    
    context = {
      logger: new LoggerImpl({ level: 'error' }),
      eventBus: new EventBusImpl(),
      environment: Environment.Development,
      config: {},
    };
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should enable image transformation by default', async () => {
    await initCommand.action(context, { 
      yes: true,
      force: true,
      skipEnv: false,
    });

    const envContent = await readFile('.env', 'utf-8');
    expect(envContent).toContain('IMAGE_TRANSFORMATION_ENABLED=true');
  });

  it('should disable image transformation with --no-image-transform flag', async () => {
    await initCommand.action(context, { 
      yes: true,
      force: true,
      skipEnv: false,
      noImageTransform: true,
    });

    const envContent = await readFile('.env', 'utf-8');
    expect(envContent).toContain('IMAGE_TRANSFORMATION_ENABLED=false');
  });

  it('should not include imgproxy settings when image transform is disabled', async () => {
    await initCommand.action(context, { 
      yes: true,
      force: true,
      skipEnv: false,
      noImageTransform: true,
    });

    const envContent = await readFile('.env', 'utf-8');
    
    // These should still be present but with IMAGE_TRANSFORMATION_ENABLED=false
    expect(envContent).toContain('IMAGE_TRANSFORMATION_ENABLED=false');
    expect(envContent).toContain('IMGPROXY_URL=');
  });

  it('should include imgproxy settings when image transform is enabled', async () => {
    await initCommand.action(context, { 
      yes: true,
      force: true,
      skipEnv: false,
      noImageTransform: false,
    });

    const envContent = await readFile('.env', 'utf-8');
    
    expect(envContent).toContain('IMAGE_TRANSFORMATION_ENABLED=true');
    expect(envContent).toContain('IMGPROXY_URL=http://imgproxy:8080');
    expect(envContent).toContain('IMGPROXY_REQUEST_TIMEOUT=15');
    expect(envContent).toContain('IMGPROXY_USE_ETAG=true');
  });
});