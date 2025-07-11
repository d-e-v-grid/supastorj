/**
 * Production environment deployment logic
 */

import { $, chalk } from 'zx';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { randomBytes } from 'crypto';
import { rm, chmod, readFile, writeFile } from 'fs/promises';

import { ConfigManager } from '../../config/config-manager.js';
import { Environment, CommandContext, DeploymentMode, StorageBackendType } from '../../types/index.js';

// Production deployment with source build support

/**
 * Generate secure random key
 */
function generateSecureKey(length: number = 32): string {
  return randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

/**
 * Generate JWT secret
 */
function generateJWTSecret(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Download and build Supabase Storage from GitHub
 */
async function downloadAndBuildStorage(
  context: CommandContext,
  targetDir: string = './storage'
): Promise<void> {
  try {
    // Clean up existing directory
    if (existsSync(targetDir)) {
      await rm(targetDir, { recursive: true, force: true });
    }

    // Clone the repository
    context.logger.info('Cloning Supabase Storage repository...');
    $.verbose = false;
    await $`git clone --depth 1 --branch master https://github.com/supabase/storage.git ${targetDir}`;

    // Change to storage directory
    const storageDir = join(process.cwd(), targetDir);

    // Install dependencies
    context.logger.info('Installing dependencies...');
    $.verbose = false;
    await $`cd ${storageDir} && npm install`;

    // Build the project
    context.logger.info('Building storage server...');
    $.verbose = false;
    await $`cd ${storageDir} && npm run build`;

    context.logger.info(chalk.green('✓') + ' Supabase Storage built successfully');

  } catch (error: any) {
    context.logger.error('Failed to build Supabase Storage');
    throw error;
  }
}

/**
 * Download and build Postgres Meta from GitHub
 */
async function downloadAndBuildPostgresMeta(
  context: CommandContext,
  targetDir: string = './postgres-meta'
): Promise<void> {
  try {
    // Clean up existing directory
    if (existsSync(targetDir)) {
      await rm(targetDir, { recursive: true, force: true });
    }

    // Clone the repository
    context.logger.info('Cloning Postgres Meta repository...');
    $.verbose = false;
    await $`git clone --depth 1 --branch master https://github.com/supabase/postgres-meta.git ${targetDir}`;

    // Change to postgres-meta directory
    const postgresMetaDir = join(process.cwd(), targetDir);

    // Install dependencies
    context.logger.info('Installing dependencies...');
    $.verbose = false;
    await $`cd ${postgresMetaDir} && npm install`;

    // Build the project
    context.logger.info('Building postgres-meta server...');
    $.verbose = false;
    await $`cd ${postgresMetaDir} && npm run build`;

    context.logger.info(chalk.green('✓') + ' Postgres Meta built successfully');

  } catch (error: any) {
    context.logger.error('Failed to build Postgres Meta');
    throw error;
  }
}

/**
 * Generate production configuration
 */
async function generateProductionConfig(
  context: CommandContext,
  options: ProdDeployOptions
): Promise<Record<string, string>> {
  const { select, text, password, confirm } = await import('@clack/prompts');

  context.logger.info(chalk.cyan('\n🔧 Storage API Production Configuration\n'));
  context.logger.info('Configure connection to your existing infrastructure.\n');

  // 1. Server configuration
  const serverHost = await text({
    message: 'Server Host',
    placeholder: '127.0.0.1',
    initialValue: '127.0.0.1',
    validate: (value) => {
      if (!value) return 'Server host is required';
      return undefined;
    },
  }) as string;

  const serverPort = await text({
    message: 'Server Port',
    placeholder: '5000',
    initialValue: '5000',
    validate: (value) => {
      const port = parseInt(value);

      if (isNaN(port) || port < 1 || port > 65535) {
        return 'Please enter a valid port number (1-65535)';
      }
      return undefined;
    },
  }) as string;

  // 2. JWT Secret
  let jwtSecret = await password({
    message: 'JWT Secret (leave empty to auto-generate)',
    mask: '*',
  }) as string | undefined;

  if (!jwtSecret || jwtSecret.trim() === '') {
    jwtSecret = generateJWTSecret();
    context.logger.info(chalk.gray('Generated JWT secret: ' + jwtSecret.substring(0, 8) + '...'));
  }

  // 3. Database URLs
  const databaseUrl = await text({
    message: 'Database URL (PostgreSQL connection string)',
    placeholder: 'postgresql://postgres:postgres@127.0.0.1:5432/storage',
    initialValue: 'postgresql://postgres:postgres@127.0.0.1:5432/storage',
    validate: (value) => {
      if (!value) return 'Database URL is required';
      if (!value.startsWith('postgresql://')) {
        return 'Database URL must start with postgresql://';
      }
      return undefined;
    },
  }) as string;

  const databasePoolUrl = await text({
    message: 'Database Pool URL (PgBouncer connection string)',
    placeholder: 'postgresql://postgres:postgres@127.0.0.1:6432/postgres',
    initialValue: 'postgresql://postgres:postgres@127.0.0.1:6432/postgres',
    validate: (value) => {
      if (!value) return 'Database Pool URL is required';
      if (!value.startsWith('postgresql://')) {
        return 'Database Pool URL must start with postgresql://';
      }
      return undefined;
    },
  }) as string;

  // 4. Storage backend
  const storageBackend = await select({
    message: 'Storage Backend',
    options: [
      { value: StorageBackendType.File, label: 'Local File System' },
      { value: StorageBackendType.S3, label: 'S3-Compatible Storage' },
    ],
  }) as StorageBackendType;

  const envVars: Record<string, string> = {
    // Server
    SERVER_HOST: serverHost,
    SERVER_PORT: serverPort,

    // Auth
    AUTH_JWT_SECRET: jwtSecret,
    AUTH_JWT_ALGORITHM: 'HS256',
    ANON_KEY: generateSecureKey(),
    SERVICE_KEY: generateSecureKey(),

    // Database
    DATABASE_URL: databaseUrl,
    DATABASE_POOL_URL: databasePoolUrl,
    DB_INSTALL_ROLES: 'true',

    // Storage Backend
    STORAGE_BACKEND: storageBackend,

    // Upload Configuration
    UPLOAD_FILE_SIZE_LIMIT: '524288000',
    UPLOAD_FILE_SIZE_LIMIT_STANDARD: '52428800',
    UPLOAD_SIGNED_URL_EXPIRATION_TIME: '120',
    TUS_URL_PATH: '/upload/resumable',
    TUS_URL_EXPIRY_MS: '3600000',

    // Tenant
    TENANT_ID: options.projectName || 'supastorj',
    REGION: 'us-east-1',
    PROJECT_NAME: options.projectName || 'supastorj',

    // Postgres Meta Configuration
    PG_META_PORT: '5001',
    PG_META_DB_HOST: new URL(databaseUrl).hostname,
    PG_META_DB_PORT: new URL(databaseUrl).port || '5432',
    PG_META_DB_NAME: new URL(databaseUrl).pathname.slice(1) || 'postgres',
    PG_META_DB_USER: new URL(databaseUrl).username || 'postgres',
    PG_META_DB_PASSWORD: new URL(databaseUrl).password || 'postgres',
    PG_META_DB_SSL: 'disable',
  };

  // 5. Storage backend specific configuration
  if (storageBackend === StorageBackendType.S3) {
    const s3Provider = await select({
      message: 'S3 Provider',
      options: [
        { value: 'minio', label: 'MinIO (Self-hosted S3-compatible storage)' },
        { value: 'rustfs', label: 'RustFS (High-performance S3-compatible storage)' },
        { value: 'aws', label: 'AWS S3' },
        { value: 'other', label: 'Other S3-compatible storage' },
      ],
    }) as string;

    const s3Endpoint = await text({
      message: 'S3 Endpoint URL',
      placeholder: s3Provider === 'aws' ? 'https://s3.amazonaws.com' : 'http://localhost:9000',
      defaultValue: s3Provider === 'aws' ? 'https://s3.amazonaws.com' : '',
      validate: (value) => {
        if (!value) return 'S3 endpoint is required';
        try {
          new URL(value);
          return undefined;
        } catch {
          return 'Please enter a valid URL';
        }
      },
    }) as string;

    const s3Bucket = await text({
      message: 'S3 Bucket Name',
      placeholder: 'storage',
      defaultValue: 'storage',
      validate: (value) => {
        if (!value) return 'Bucket name is required';
        if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(value)) {
          return 'Invalid bucket name format';
        }
        return undefined;
      },
    }) as string;

    const s3Region = await text({
      message: 'S3 Region',
      placeholder: 'us-east-1',
      defaultValue: 'us-east-1',
    }) as string;

    const s3AccessKey = await text({
      message: 'S3 Access Key ID',
      placeholder: 'your-access-key',
      validate: (value) => {
        if (!value) return 'Access key is required';
        return undefined;
      },
    }) as string;

    const s3SecretKey = await password({
      message: 'S3 Secret Access Key',
      mask: '*',
      validate: (value) => {
        if (!value) return 'Secret key is required';
        return undefined;
      },
    }) as string;

    Object.assign(envVars, {
      STORAGE_S3_BUCKET: s3Bucket,
      STORAGE_S3_ENDPOINT: s3Endpoint,
      STORAGE_S3_FORCE_PATH_STYLE: s3Provider !== 'aws' ? 'true' : 'false',
      STORAGE_S3_REGION: s3Region,
      AWS_ACCESS_KEY_ID: s3AccessKey,
      AWS_SECRET_ACCESS_KEY: s3SecretKey,
      S3_PROTOCOL_ACCESS_KEY_ID: '',
      S3_PROTOCOL_ACCESS_KEY_SECRET: '',
    });
  } else {
    // File storage configuration
    const storagePath = await text({
      message: 'File Storage Path',
      placeholder: '/var/lib/storage',
      defaultValue: '/var/lib/storage',
    }) as string;

    envVars['STORAGE_FILE_BACKEND_PATH'] = storagePath;
  }

  // 6. Image transformation
  const imageTransform = options.imageTransform ?? true;
  let enableImageTransform = imageTransform;

  if (!options.yes) {
    const imageTransformResult = await confirm({
      message: 'Enable image transformation? (requires imgproxy)',
      initialValue: imageTransform,
    });
    enableImageTransform = typeof imageTransformResult === 'boolean' ? imageTransformResult : imageTransform;
  }

  envVars['IMAGE_TRANSFORMATION_ENABLED'] = enableImageTransform ? 'true' : 'false';

  if (enableImageTransform) {
    const imgproxyUrl = await text({
      message: 'Imgproxy URL',
      placeholder: 'http://localhost:8080',
      defaultValue: 'http://localhost:8080',
    }) as string;

    envVars['IMGPROXY_URL'] = imgproxyUrl;
    envVars['IMGPROXY_REQUEST_TIMEOUT'] = '15';
  }

  return envVars;
}

// Removed unused functions - these are not needed for simplified production deployment

export interface ProdDeployOptions {
  services?: string;
  dryRun?: boolean;
  force?: boolean;
  yes?: boolean;
  skipEnv?: boolean;
  imageTransform: boolean;
  projectName?: string;
}

/**
 * Create startup and shutdown scripts for production deployment
 */
async function createProductionScripts(envVars: Record<string, string>): Promise<void> {
  // This function is now empty as we handle systemd service creation in the start command
  // The service file will be created and installed transparently when running `supastorj start`
}

export async function deployProdEnvironment(
  context: CommandContext,
  options: ProdDeployOptions
): Promise<void> {
  try {
    const { intro, outro } = await import('@clack/prompts');

    intro(chalk.cyan('🚀 Supastorj Production Deployment'));

    // Always build from source for production
    context.logger.info('Building Supabase Storage from source for production deployment...');
    await downloadAndBuildStorage(context);

    // Build postgres-meta from source
    context.logger.info('Building Postgres Meta from source for production deployment...');
    await downloadAndBuildPostgresMeta(context);

    // Generate production configuration
    const envVars = await generateProductionConfig(context, options);

    // Merge with template
    const templatePath = join(dirname(fileURLToPath(import.meta.url)), '../../../templates/.env.storage');
    let templateContent = '';

    if (existsSync(templatePath)) {
      templateContent = await readFile(templatePath, 'utf-8');
    }

    // Parse template to preserve structure
    const templateLines = templateContent.split('\n');
    const updatedLines: string[] = [];
    const usedKeys = new Set<string>();

    // Update existing values from template
    for (const line of templateLines) {
      if (line.trim().startsWith('#') || line.trim() === '') {
        updatedLines.push(line);
        continue;
      }

      const match = line.match(/^([^=]+)=(.*)$/);
      if (match && match[1]) {
        const key = match[1].trim();
        if (Object.prototype.hasOwnProperty.call(envVars, key)) {
          const value = envVars[key];
          if (value !== undefined) {
            updatedLines.push(`${key}=${value}`);
            usedKeys.add(key);
          } else {
            updatedLines.push(line);
          }
        } else {
          updatedLines.push(line);
        }
      } else {
        updatedLines.push(line);
      }
    }

    // Add any new keys that weren't in template
    const newKeys = Object.keys(envVars).filter(k => !usedKeys.has(k));
    if (newKeys.length > 0) {
      updatedLines.push('');
      updatedLines.push('#######################################');
      updatedLines.push('# Additional Configuration');
      updatedLines.push('#######################################');
      for (const key of newKeys) {
        updatedLines.push(`${key}=${envVars[key]}`);
      }
    }

    // Save configuration as .env (not .env.storage)
    const envPath = join(process.cwd(), '.env');
    await writeFile(envPath, updatedLines.join('\n'), 'utf-8');
    await chmod(envPath, 0o600);

    context.logger.info(chalk.green('✅ Created .env'));

    // Create startup/shutdown scripts (currently empty, kept for compatibility)
    await createProductionScripts(envVars);

    // Create config file for production
    const configManager = new ConfigManager();
    const config = ConfigManager.generateDefault({
      projectName: options.projectName || 'supastorj',
      environment: Environment.Production,
      storageBackend: envVars['STORAGE_BACKEND'] as StorageBackendType || StorageBackendType.S3,
    });

    // Update deployment mode
    config.deploymentMode = DeploymentMode.BareMetal;

    // Update service configuration based on user input
    if (config.services) {
      // Update postgres connection info
      const dbUrl = new URL(envVars['DATABASE_URL'] || '');
      config.services.postgres = {
        enabled: true,
        port: parseInt(dbUrl.port || '5432'),
        host: dbUrl.hostname,
      };

      // Update pgBouncer connection info
      const poolUrl = new URL(envVars['DATABASE_POOL_URL'] || '');
      config.services.pgBouncer = {
        enabled: true,
        port: parseInt(poolUrl.port || '6432'),
        host: poolUrl.hostname,
      };

      // Update storage API info
      config.services.storage = {
        enabled: true,
        port: parseInt(envVars['SERVER_PORT'] || '3000'),
        host: envVars['SERVER_HOST'] || 'localhost',
      };

      // Update MinIO/S3 info if using S3 backend
      if (envVars['STORAGE_BACKEND'] === StorageBackendType.S3 && envVars['STORAGE_S3_ENDPOINT']) {
        const s3Url = new URL(envVars['STORAGE_S3_ENDPOINT']);
        config.services.minio = {
          enabled: true,
          port: parseInt(s3Url.port || '9000'),
          consolePort: 9001, // Default console port
          host: s3Url.hostname,
        };
      }

      // Update imgproxy info if enabled
      if (envVars['IMAGE_TRANSFORMATION_ENABLED'] === 'true' && envVars['IMGPROXY_URL']) {
        const imgproxyUrl = new URL(envVars['IMGPROXY_URL']);
        config.services.imgproxy = {
          enabled: true,
          port: parseInt(imgproxyUrl.port || '8080'),
          host: imgproxyUrl.hostname,
        };
      }
    }

    // Save configuration
    await configManager.save(config);

    outro(chalk.green(`
✅ Production deployment configured successfully!

Next steps:
1. Review configuration in ${chalk.cyan('.env')}
2. Run ${chalk.cyan('supastorj start')} to start the service
3. Check logs with ${chalk.cyan('supastorj logs')} or ${chalk.cyan('sudo journalctl -u supastorj-storage.service -f')}
`));

  } catch (error: any) {
    context.logger.error('Deployment failed:', error.message);
    process.exit(1);
  }
}
