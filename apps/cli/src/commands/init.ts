/**
 * Init command - Initialize a new Supastorj project
 */

import { writeFile, mkdir, access, constants, copyFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { intro, outro, text, select, confirm, spinner } from '@clack/prompts';
import chalk from 'chalk';
import { randomBytes } from 'crypto';
import { dump as stringifyYaml } from 'js-yaml';

import { CommandDefinition, CommandContext, Environment } from '../types/index.js';
import { ConfigManager } from '../config/config-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Generate a secure random key
 */
function generateSecureKey(length: number = 32): string {
  return randomBytes(length).toString('base64').slice(0, length);
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

export const initCommand: CommandDefinition = {
  name: 'init',
  description: 'Initialize a new Supastorj project',
  options: [
    {
      flags: '-f, --force',
      description: 'Overwrite existing configuration',
      defaultValue: false,
    },
    {
      flags: '-y, --yes',
      description: 'Skip prompts and use default values',
      defaultValue: false,
    },
    {
      flags: '--skip-env',
      description: 'Skip .env file generation',
      defaultValue: false,
    },
    {
      flags: '--no-image-transform',
      description: 'Disable image transformation feature',
      defaultValue: false,
    },
  ],
  action: async (context: CommandContext, options: any) => {
    const { force, yes, skipEnv, noImageTransform } = options;
    
    intro(chalk.cyan('🚀 Welcome to Supastorj!'));
    
    // Check if configuration already exists
    const configPath = './supastor.config.yaml';
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
          outro(chalk.yellow('Initialization cancelled.'));
          return;
        }
      }
    }
    
    // Get project configuration
    let projectName = 'supastorj';
    let environment = Environment.Development;
    let storageBackend = 'file';
    
    if (!yes) {
      projectName = await text({
        message: 'Project name:',
        placeholder: 'supastorj',
        defaultValue: 'supastorj',
      }) as string;
      
      environment = await select({
        message: 'Default environment:',
        options: [
          { value: Environment.Development, label: 'Development' },
          { value: Environment.Staging, label: 'Staging' },
          { value: Environment.Production, label: 'Production' },
        ],
      }) as Environment;
      
      storageBackend = await select({
        message: 'Storage backend:',
        options: [
          { value: 'file', label: 'File System (local storage)' },
          { value: 's3', label: 'S3 Compatible (MinIO)' },
        ],
      }) as string;
      
      // Ask about image transformation
      const enableImageTransformation = await confirm({
        message: 'Enable image transformation (requires imgproxy)?',
        initialValue: !noImageTransform,
      });
      
      options.imageTransform = enableImageTransformation;
    } else {
      // In yes mode, respect the noImageTransform flag
      options.imageTransform = !noImageTransform;
    }
    
    const s = spinner();
    s.start('Generating configuration files...');
    
    try {
      // Generate default configuration
      const config = ConfigManager.generateDefault();
      
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
          ENVIRONMENT: environment,
          
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
        if (storageBackend === 's3') {
          Object.assign(envVars, {
            // MinIO (S3-compatible storage)
            MINIO_ROOT_USER: 'supastor',
            MINIO_ROOT_PASSWORD: minioPassword,
            MINIO_PORT: '9000',
            MINIO_CONSOLE_PORT: '9001',
            MINIO_DEFAULT_BUCKETS: 'storage',
            
            // S3 Configuration
            STORAGE_S3_BUCKET: 'storage',
            STORAGE_S3_ENDPOINT: 'http://minio:9000',
            STORAGE_S3_FORCE_PATH_STYLE: 'true',
            STORAGE_S3_REGION: 'us-east-1',
            AWS_ACCESS_KEY_ID: 'supastor',
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
          IMAGE_TRANSFORMATION_ENABLED: !noImageTransform ? 'true' : 'false',
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
        
        // Also create .env.example
        const exampleVars = { ...envVars };
        Object.keys(exampleVars).forEach(key => {
          if (key.includes('KEY') || key.includes('SECRET') || key.includes('PASSWORD')) {
            exampleVars[key] = '<your-secret-here>';
          }
        });
        
        const exampleContent = Object.entries(exampleVars)
          .map(([key, value]) => `${key}=${value}`)
          .join('\n') + '\n';
        
        await writeFile('.env.example', exampleContent, 'utf-8');
      }
      
      // Create directory structure
      const directories = [
        './data/postgres',
        './data/storage',
        './logs',
        './templates',
        './plugins',
        './config/postgres',
      ];
      
      for (const dir of directories) {
        await mkdir(dir, { recursive: true });
      }
      
      // Create .gitignore
      const gitignoreContent = `
# Environment files
.env
.env.local
.env.*.local

# Data directories
data/
logs/

# OS files
.DS_Store
Thumbs.db

# IDE files
.vscode/
.idea/
*.swp
*.swo

# Node modules
node_modules/

# Build outputs
dist/
build/
*.log
`.trim();
      
      await writeFile('.gitignore', gitignoreContent, 'utf-8');
      
      // Create README
      const readmeContent = `
# ${projectName}

A Supastorj project for managing Supabase Storage.

## Getting Started

1. Review and update the configuration in \`supastor.config.yaml\`
2. Update environment variables in \`.env\`
3. Start the services:

\`\`\`bash
supastor up
\`\`\`

## Commands

- \`supastor up\` - Start all services
- \`supastor down\` - Stop all services
- \`supastor status\` - View service status
- \`supastor logs [service]\` - View service logs
- \`supastor --help\` - View all available commands

## Configuration

Edit \`supastor.config.yaml\` to customize your deployment.

## License

[Your License Here]
`.trim();
      
      await writeFile('README.md', readmeContent, 'utf-8');
      
      // Copy docker-compose templates
      const templatesDir = join(__dirname, '../../templates');
      const composeFiles = [
        'docker-compose.yml',
        'docker-compose.prod.yml',
        'docker-compose.monitoring.yml'
      ];
      
      for (const file of composeFiles) {
        const sourcePath = join(templatesDir, file);
        const destPath = join('./', file);
        
        try {
          await copyFile(sourcePath, destPath);
          context.logger.debug(`Copied ${file}`);
        } catch (error) {
          context.logger.warn(`Failed to copy ${file}:`, error);
        }
      }
      
      // Copy PostgreSQL configuration files
      const postgresConfigFiles = [
        'config/postgres/01-init.sql',
        'config/postgres/pg_hba.conf',
        'config/postgres/postgresql.conf'
      ];
      
      for (const file of postgresConfigFiles) {
        const sourcePath = join(templatesDir, file);
        const destPath = join('./', file);
        
        try {
          await copyFile(sourcePath, destPath);
          context.logger.debug(`Copied ${file}`);
        } catch (error) {
          context.logger.warn(`Failed to copy ${file}:`, error);
        }
      }
      
      s.stop('Configuration files generated!');
      
      // Log audit event
      context.logger.audit('project_initialized', {
        projectName,
        environment,
        configPath,
      });
      
      outro(chalk.green(`
✅ Project initialized successfully!

Next steps:
1. Review the configuration in ${chalk.cyan('supastor.config.yaml')}
2. Update environment variables in ${chalk.cyan('.env')}
3. Run ${chalk.cyan('supastor up')} to start the services${
  noImageTransform ? '' : `
4. To include image transformation, run ${chalk.cyan('supastor up --profile imgproxy')}`
}

Happy coding! 🎉
      `.trim()));
      
    } catch (error) {
      s.stop('Failed to generate configuration files');
      throw error;
    }
  },
};