/**
 * Production environment deployment logic
 */

import { $ } from 'zx';
import chalk from 'chalk';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { randomBytes } from 'crypto';
import { rm , mkdir, chmod, readFile, writeFile } from 'fs/promises';

import { CommandContext, StorageBackendType } from '../../types/index.js';

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
  context.logger.info('Downloading Supabase Storage source code...');
  
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
    placeholder: '0.0.0.0',
    defaultValue: '0.0.0.0',
    validate: (value) => {
      if (!value) return 'Server host is required';
      return undefined;
    },
  }) as string;
  
  const serverPort = await text({
    message: 'Server Port',
    placeholder: '5000',
    defaultValue: '5000',
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
  const enableImageTransform = await confirm({
    message: 'Enable image transformation? (requires imgproxy)',
    initialValue: false,
  });
  
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
  skipDeps?: boolean;
  services?: string;
  dryRun?: boolean;
  force?: boolean;
  yes?: boolean;
  skipEnv?: boolean;
  projectName?: string;
}

/**
 * Create startup and shutdown scripts for production deployment
 */
async function createProductionScripts(envVars: Record<string, string>): Promise<void> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  
  // Create systemd service from template
  const templatesDir = join(__dirname, '../../../templates');
  const serviceTemplate = await readFile(join(templatesDir, 'supastorj.service'), 'utf-8');
  const workDir = process.cwd();
  
  // Simple template replacement for source-based deployment only
  let serviceContent = serviceTemplate
    .replace(/{{systemUser}}/g, process.env['USER'] || 'supastorj')
    .replace(/{{systemGroup}}/g, process.env['USER'] || 'supastorj')
    .replace(/{{workingDirectory}}/g, workDir);
  
  // Remove Docker sections and keep only source sections
  serviceContent = serviceContent
    .replace(/{{#useDocker}}[\s\S]*?{{\/useDocker}}/g, '')
    .replace(/{{#useSource}}\n?/, '')
    .replace(/\n?{{\/useSource}}/, '');
  
  await writeFile('./supastorj.service', serviceContent);
  
  // Create convenience start/stop scripts
  const startScript = `#!/bin/bash
set -e

echo "Starting Supastorj Storage API..."

# Load environment variables
set -a
source ${workDir}/.env
set +a

# Check which server file exists
if [ -f "${workDir}/storage/dist/start/server.js" ]; then
  # Production build location
  cd ${workDir}/storage
  exec node dist/start/server.js
elif [ -f "${workDir}/storage/dist/main/index.js" ]; then
  # Alternative build location
  cd ${workDir}/storage
  exec node dist/main/index.js
else
  echo "Error: Storage server not found!"
  echo "Expected locations:"
  echo "  - ${workDir}/storage/dist/start/server.js"
  echo "  - ${workDir}/storage/dist/main/index.js"
  exit 1
fi
`;

  const stopScript = `#!/bin/bash
set -e

echo "Stopping Supastorj Storage API..."

# Find and kill the process (try both possible paths)
pkill -f "node.*storage/dist/start/server.js" || true
pkill -f "node.*storage/dist/main/index.js" || true

# Give process time to shut down gracefully
sleep 2

# Force kill if still running
pkill -9 -f "node.*storage/dist/start/server.js" 2>/dev/null || true
pkill -9 -f "node.*storage/dist/main/index.js" 2>/dev/null || true

echo "Supastorj Storage API stopped."
`;

  await writeFile('./start-storage.sh', startScript);
  await chmod('./start-storage.sh', 0o755);
  
  await writeFile('./stop-storage.sh', stopScript);
  await chmod('./stop-storage.sh', 0o755);
}

export async function deployProdEnvironment(
  context: CommandContext,
  options: ProdDeployOptions
): Promise<void> {
  try {
    const { intro, outro, confirm } = await import('@clack/prompts');
    
    intro(chalk.cyan('🚀 Supastorj Production Deployment'));
    
    // Always build from source for production
    context.logger.info('Building Supabase Storage from source for production deployment...');
    await downloadAndBuildStorage(context);
    
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
    
    // Create startup/shutdown scripts
    await createProductionScripts(envVars);
    
    context.logger.info(chalk.green('✅ Created supastorj.service'));
    
    // Create deployment README from template
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const templatesDir = join(__dirname, '../../../templates');
    const readmeTemplate = await readFile(join(templatesDir, 'README-DEPLOYMENT.md'), 'utf-8');
    
    const readmeContent = readmeTemplate
      .replace(/{{serverHost}}/g, envVars['SERVER_HOST'] || '0.0.0.0')
      .replace(/{{serverPort}}/g, envVars['SERVER_PORT'] || '5000')
      .replace(/{{jwtSecretPreview}}/g, envVars['AUTH_JWT_SECRET']?.substring(0, 8) || 'N/A')
      .replace(/{{anonKeyPreview}}/g, envVars['ANON_KEY']?.substring(0, 8) || 'N/A')
      .replace(/{{serviceKeyPreview}}/g, envVars['SERVICE_KEY']?.substring(0, 8) || 'N/A');
    
    await writeFile('README-DEPLOYMENT.md', readmeContent, 'utf-8');
    context.logger.info(chalk.green('✅ Created README-DEPLOYMENT.md'));
    
    // Create project mode artifact
    const modeArtifact = {
      mode: 'production',
      createdAt: new Date().toISOString(),
      projectName: options.projectName || 'supastorj',
      storageBackend: envVars['STORAGE_BACKEND'] || 's3',
      buildFromSource: true,
      databaseUrl: envVars['DATABASE_URL'] ? 'configured' : 'not-configured',
    };
    
    await mkdir('.supastorj', { recursive: true });
    await writeFile('.supastorj/project.json', JSON.stringify(modeArtifact, null, 2), 'utf-8');
    
    outro(chalk.green(`
✅ Production deployment configured successfully!

Next steps:
1. Review configuration in ${chalk.cyan('.env')}
2. Install systemd service (if applicable)
3. Check logs after starting the service

For systemd deployment, see README-DEPLOYMENT.md
`));
    
  } catch (error: any) {
    context.logger.error('Deployment failed:', error.message);
    process.exit(1);
  }
}
