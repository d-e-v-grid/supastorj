/**
 * Production environment deployment logic
 */

import ora from 'ora';
import chalk from 'chalk';
import { execa } from 'execa';
import { mkdir, chmod, writeFile, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { randomBytes } from 'crypto';

import { CommandContext } from '../../types/index.js';

// Simplified production deployment - no longer deploys all services

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
 * Generate production configuration - simplified mode for existing infrastructure
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
    placeholder: 'postgresql://user:password@host:port/database',
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
    placeholder: 'postgresql://user:password@host:port/database',
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
      { value: 'file', label: 'Local File System' },
      { value: 's3', label: 'S3-Compatible Storage' },
    ],
  }) as string;
  
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
    TENANT_ID: 'supastorj',
    REGION: 'us-east-1',
  };
  
  // 5. Storage backend specific configuration
  if (storageBackend === 's3') {
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
    
    envVars['FILE_STORAGE_BACKEND_PATH'] = storagePath;
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
}

/**
 * Create startup and shutdown scripts for production deployment
 */
async function createProductionScripts(
  envVars: Record<string, string>,
  envPath: string
): Promise<void> {
  // Create startup script
  const startScript = `#!/bin/bash
# Supastorj Storage API Start Script
# Generated on ${new Date().toISOString()}

set -e

# Load environment variables
if [ -f "${envPath}" ]; then
  export $(cat "${envPath}" | grep -v '^#' | xargs)
else
  echo "Error: ${envPath} not found"
  exit 1
fi

# Check if storage-api is already running
if pgrep -f "supabase/storage-api" > /dev/null; then
  echo "Storage API is already running"
  exit 0
fi

echo "Starting Supabase Storage API..."

# Pull latest storage-api image
docker pull supabase/storage-api:v1.13.1

# Create necessary directories
mkdir -p /var/lib/storage
mkdir -p /var/log/storage-api

# Start storage-api container
docker run -d \\
  --name storage-api \\
  --restart unless-stopped \\
  --network host \\
  -v /var/lib/storage:/var/lib/storage \\
  -v /var/log/storage-api:/var/log \\
  --env-file "${envPath}" \\
  -e SERVER_PORT=$SERVER_PORT \\
  -e SERVER_HOST=$SERVER_HOST \\
  supabase/storage-api:v1.13.1

echo "Storage API started successfully"
echo "Check logs: docker logs -f storage-api"
echo "API available at: http://$SERVER_HOST:$SERVER_PORT"
`;

  // Create shutdown script
  const stopScript = `#!/bin/bash
# Supastorj Storage API Stop Script
# Generated on ${new Date().toISOString()}

set -e

echo "Stopping Supabase Storage API..."

# Stop and remove container
if docker ps -a | grep -q storage-api; then
  docker stop storage-api || true
  docker rm storage-api || true
  echo "Storage API stopped"
else
  echo "Storage API is not running"
fi
`;

  // Create systemd service (optional)
  const systemdService = `[Unit]
Description=Supabase Storage API
After=docker.service
Requires=docker.service

[Service]
Type=simple
Restart=always
RestartSec=10
EnvironmentFile=${envPath}
ExecStartPre=-/usr/bin/docker stop storage-api
ExecStartPre=-/usr/bin/docker rm storage-api
ExecStart=/usr/bin/docker run --rm --name storage-api \\
  --network host \\
  -v /var/lib/storage:/var/lib/storage \\
  -v /var/log/storage-api:/var/log \\
  --env-file ${envPath} \\
  supabase/storage-api:v1.13.1
ExecStop=/usr/bin/docker stop storage-api

[Install]
WantedBy=multi-user.target
`;

  // Write scripts
  await writeFile('./start-storage.sh', startScript, { mode: 0o755 });
  await writeFile('./stop-storage.sh', stopScript, { mode: 0o755 });
  await writeFile('./storage-api.service', systemdService);
}

export async function deployProdEnvironment(
  context: CommandContext,
  options: ProdDeployOptions
): Promise<void> {
  try {
    const { intro, outro } = await import('@clack/prompts');
    
    intro(chalk.cyan('🚀 Supastorj Production Deployment'));
    
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
    
    // Save configuration
    const envPath = join(process.cwd(), '.env.storage');
    await writeFile(envPath, updatedLines.join('\n'), 'utf-8');
    await chmod(envPath, 0o600);
    
    context.logger.info(chalk.green('✅ Created .env.storage'));
    
    // Create startup/shutdown scripts
    await createProductionScripts(envVars, envPath);
    
    context.logger.info(chalk.green('✅ Created start-storage.sh'));
    context.logger.info(chalk.green('✅ Created stop-storage.sh'));
    context.logger.info(chalk.green('✅ Created storage-api.service'));
    
    // Create deployment README
    const readmeContent = `# Supastorj Storage API Deployment

## Configuration
Configuration is stored in \`.env.storage\`

## Quick Start

### Using Docker
\`\`\`bash
# Start the storage API
./start-storage.sh

# Stop the storage API
./stop-storage.sh

# View logs
docker logs -f storage-api
\`\`\`

### Using systemd (recommended)
\`\`\`bash
# Copy service file
sudo cp storage-api.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable auto-start
sudo systemctl enable storage-api

# Start service
sudo systemctl start storage-api

# Check status
sudo systemctl status storage-api

# View logs
sudo journalctl -u storage-api -f
\`\`\`

## API Endpoints
- Health check: http://${envVars['SERVER_HOST']}:${envVars['SERVER_PORT']}/health
- Storage API: http://${envVars['SERVER_HOST']}:${envVars['SERVER_PORT']}/

## Security Notes
- Keep \`.env.storage\` secure (mode 600)
- Generated keys:
  - JWT Secret: ${envVars['AUTH_JWT_SECRET']?.substring(0, 8) || 'N/A'}...
  - Anon Key: ${envVars['ANON_KEY']?.substring(0, 8) || 'N/A'}...
  - Service Key: ${envVars['SERVICE_KEY']?.substring(0, 8) || 'N/A'}...

## Troubleshooting
- Check logs: \`docker logs storage-api\`
- Verify connectivity to PostgreSQL
- Ensure S3/storage backend is accessible
- Check firewall rules for port ${envVars['SERVER_PORT']}
`;
    
    await writeFile('README-DEPLOYMENT.md', readmeContent, 'utf-8');
    context.logger.info(chalk.green('✅ Created README-DEPLOYMENT.md'));
    
    outro(chalk.green(`
✅ Production deployment configured successfully!

Next steps:
1. Review configuration in ${chalk.cyan('.env.storage')}
2. Start the Storage API: ${chalk.cyan('./start-storage.sh')}
3. Check logs: ${chalk.cyan('docker logs -f storage-api')}

For systemd deployment, see README-DEPLOYMENT.md
`));
    
  } catch (error: any) {
    context.logger.error('Deployment failed:', error.message);
    process.exit(1);
  }
}
