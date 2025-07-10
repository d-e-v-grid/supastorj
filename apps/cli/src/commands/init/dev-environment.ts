/**
 * Development environment deployment logic
 */

import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { randomBytes } from 'crypto';
import { dump as stringifyYaml } from 'js-yaml';
import { mkdir, access, copyFile, writeFile, constants } from 'fs/promises';
import { text, intro, outro, select, confirm, spinner } from '@clack/prompts';

import { ConfigManager } from '../../config/config-manager.js';
import { Environment, CommandContext, StorageBackendType } from '../../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Generate a secure random key
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
 * Check if directory exists
 */
async function directoryExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure directory exists
 */
async function ensureDirectory(path: string): Promise<void> {
  const dir = dirname(path);
  if (!(await directoryExists(dir))) {
    await mkdir(dir, { recursive: true });
  }
}

export interface DevDeployOptions {
  force?: boolean;
  yes?: boolean;
  skipEnv?: boolean;
  noImageTransform?: boolean;
  storageBackend?: StorageBackendType;
  projectName?: string;
}

export async function deployDevEnvironment(
  context: CommandContext,
  options: DevDeployOptions
): Promise<void> {
  const { force, yes, skipEnv, noImageTransform } = options;
  
  intro(chalk.cyan('🚀 Deploying Supastorj Development Environment'));
  
  // Check if configuration already exists
  const configPath = './supastorj.config.yaml';
  const envPath = './.env';
  
  if (!force) {
    const configExists = await directoryExists(configPath);
    const envExists = await directoryExists(envPath);
    
    if (configExists || envExists) {
      const shouldContinue = yes || await confirm({
        message: 'Configuration files already exist. Overwrite?',
        initialValue: false,
      });
      
      if (!shouldContinue) {
        outro(chalk.yellow('Deployment cancelled.'));
        return;
      }
    }
  }
  
  // Get project configuration
  let projectName = options.projectName || 'supastorj';
  let storageBackend = options.storageBackend || StorageBackendType.File;
  
  // In dev environment, always use Development environment
  const environment = Environment.Development;
  
  if (!yes) {
    storageBackend = await select({
      message: 'Storage backend:',
      options: [
        { value: StorageBackendType.File, label: 'File System (local storage)' },
        { value: StorageBackendType.S3, label: 'S3 Compatible (MinIO)' },
      ],
    }) as StorageBackendType;
    
    // Ask about image transformation
    const enableImageTransformation = await confirm({
      message: 'Enable image transformation (requires imgproxy)?',
      initialValue: !noImageTransform,
    });
    
    options.noImageTransform = !enableImageTransformation;
  }
  
  const s = spinner();
  s.start('Generating configuration files...');
  
  try {
    // Generate default configuration based on selected storage mode
    const config = ConfigManager.generateDefault(storageBackend);
    config.projectName = projectName;
    config.environment = environment;
    
    // Enable imgproxy if requested
    if (!options.noImageTransform && config.services) {
      config.services.imgproxy = {
        enabled: true,
        port: 8080,
      };
    }
    
    // Write configuration file
    await ensureDirectory(configPath);
    const yamlContent = stringifyYaml(config, {
      indent: 2,
      lineWidth: 120,
    });
    await writeFile(configPath, yamlContent, 'utf-8');
    
    // Generate environment variables
    if (!skipEnv) {
      const minioPassword = generateSecureKey(16);
      const envVars: Record<string, string> = {
        // Project settings
        PROJECT_NAME: projectName,
        
        // Security keys
        ANON_KEY: generateSecureKey(),
        SERVICE_KEY: generateSecureKey(),
        JWT_SECRET: generateJWTSecret(),
        JWT_ALGORITHM: 'HS256',
        
        // Database
        POSTGRES_DB: 'storage',
        POSTGRES_USER: 'postgres',
        POSTGRES_PASSWORD: generateSecureKey(16),
        POSTGRES_PORT: '5432',
        POSTGRES_SSL: 'off',
        
        // PgBouncer
        PGBOUNCER_PORT: '6432',
        PGBOUNCER_POOL_MODE: 'transaction',
        PGBOUNCER_MAX_CLIENT_CONN: '100',
        PGBOUNCER_DEFAULT_POOL_SIZE: '20',
        PGBOUNCER_MAX_DB_CONNECTIONS: '50',
        
        // Storage API
        STORAGE_PORT: '5000',
        STORAGE_BACKEND: storageBackend,
      };
      
      // Add S3-specific settings only if s3 backend is selected
      if (storageBackend === StorageBackendType.S3) {
        Object.assign(envVars, {
          // MinIO (S3-compatible storage)
          MINIO_ROOT_USER: 'supastorj',
          MINIO_ROOT_PASSWORD: minioPassword,
          MINIO_PORT: '9000',
          MINIO_CONSOLE_PORT: '9001',
          MINIO_DEFAULT_BUCKETS: 'storage',
          
          // S3 Configuration
          STORAGE_S3_BUCKET: 'storage',
          STORAGE_S3_ENDPOINT: 'http://minio:9000',
          STORAGE_S3_FORCE_PATH_STYLE: 'true',
          STORAGE_S3_REGION: 'us-east-1',
          AWS_ACCESS_KEY_ID: 'supastorj',
          AWS_SECRET_ACCESS_KEY: minioPassword,
        });
      }
      
      // Add remaining common settings
      Object.assign(envVars, {
        // Postgres Meta
        POSTGRES_META_PORT: '8080',
        
        // Upload limits
        UPLOAD_FILE_SIZE_LIMIT: '524288000',
        UPLOAD_FILE_SIZE_LIMIT_STANDARD: '52428800',
        UPLOAD_SIGNED_URL_EXPIRATION_TIME: '120',
        TUS_URL_PATH: '/upload/resumable',
        TUS_URL_EXPIRY_MS: '3600000',
        
        // Image transformation
        IMAGE_TRANSFORMATION_ENABLED: (!options.noImageTransform ? 'true' : 'false'),
        IMGPROXY_URL: 'http://imgproxy:8080',
        IMGPROXY_REQUEST_TIMEOUT: '15',
        IMGPROXY_USE_ETAG: 'true',
        IMGPROXY_ENABLE_WEBP_DETECTION: 'true',
        IMGPROXY_JPEG_PROGRESSIVE: 'false',
        IMGPROXY_PNG_INTERLACED: 'false',
        IMGPROXY_QUALITY: '95',
        IMGPROXY_MAX_SRC_RESOLUTION: '50',
        IMGPROXY_MAX_SRC_FILE_SIZE: '104857600',
        IMGPROXY_SECRET: '',
        IMGPROXY_SALT: '',
        
        // S3 Protocol (optional)
        S3_PROTOCOL_ACCESS_KEY_ID: '',
        S3_PROTOCOL_ACCESS_KEY_SECRET: '',
        
        // Tenant and region
        TENANT_ID: projectName,
        REGION: 'us-east-1',
        GLOBAL_S3_BUCKET: '',
        
        // Database roles
        DB_INSTALL_ROLES: 'true',
        
        // Redis (optional)
        REDIS_PASSWORD: generateSecureKey(16),
        REDIS_PORT: '6379',
      });
      
      // Generate .env content
      const envContent = Object.entries(envVars)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n') + '\n';
      
      await writeFile(envPath, envContent, 'utf-8');
    }
    
    // Create directory structure
    const directories = [
      './logs',
      './plugins',
    ];
    
    for (const dir of directories) {
      await mkdir(dir, { recursive: true });
    }
    
    // Copy template files
    const templatesDir = join(__dirname, '../../../templates');
    const templateFiles = [
      { src: '.gitignore', dest: '.gitignore' },
      { src: 'README.md', dest: 'README.md' },
    ];
    
    for (const { src, dest } of templateFiles) {
      const sourcePath = join(templatesDir, src);
      const destPath = join('./', dest);
      
      try {
        const { readFile } = await import('fs/promises');
        let content = await readFile(sourcePath, 'utf-8');
        
        // Replace template variables
        content = content.replace(/{{projectName}}/g, projectName);
        
        await writeFile(destPath, content, 'utf-8');
        context.logger.debug(`Created ${dest} from template`);
      } catch (error) {
        context.logger.warn(`Failed to copy template ${src}:`, error);
      }
    }
    
    // Create project mode artifact
    const modeArtifact = {
      mode: 'development',
      createdAt: new Date().toISOString(),
      projectName: projectName,
      storageBackend: storageBackend,
      imageTransformEnabled: !options.noImageTransform,
    };
    
    await ensureDirectory('.supastorj/project.json');
    await writeFile('.supastorj/project.json', JSON.stringify(modeArtifact, null, 2), 'utf-8');
    
    // Copy docker-compose template
    const composeFile = 'docker-compose.yml';
    
    const sourcePath = join(templatesDir, composeFile);
    const destPath = join('./', composeFile);
    
    try {
      await copyFile(sourcePath, destPath);
      context.logger.debug(`Copied ${composeFile}`);
    } catch (error) {
      context.logger.warn(`Failed to copy ${composeFile}:`, error);
    }
    
    
    s.stop('Configuration files generated!');
    
    // Log audit event
    context.logger.audit('dev_environment_deployed', {
      projectName,
      environment,
      configPath,
    });
    
    outro(chalk.green(`
✅ Development environment deployed successfully!

Next steps:
1. Review the configuration in ${chalk.cyan('supastorj.config.yaml')}
2. Update environment variables in ${chalk.cyan('.env')}
3. Run ${chalk.cyan('supastorj start')} to start the services${
  options.noImageTransform ? '' : `
4. To include image transformation, run ${chalk.cyan('supastorj start --profile imgproxy')}`
}

Happy coding! 🎉
    `.trim()));
    
  } catch (error) {
    s.stop('Failed to generate configuration files');
    throw error;
  }
}