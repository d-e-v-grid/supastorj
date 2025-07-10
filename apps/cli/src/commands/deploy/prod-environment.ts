/**
 * Production environment deployment logic
 */

import ora from 'ora';
import chalk from 'chalk';
import { execa } from 'execa';
import { mkdir, chmod, writeFile } from 'fs/promises';

import { CommandContext } from '../../types/index.js';

export interface ServiceConfig {
  name: string;
  repo: string;
  version: string;
  systemdService: string;
  configPath: string;
  dependencies: string[];
}

export const SERVICES: ServiceConfig[] = [
  {
    name: 'postgresql',
    repo: '',
    version: '16',
    systemdService: 'postgresql',
    configPath: '/etc/postgresql/16/main',
    dependencies: ['postgresql-16', 'postgresql-contrib-16'],
  },
  {
    name: 'pgbouncer',
    repo: '',
    version: 'latest',
    systemdService: 'pgbouncer',
    configPath: '/etc/pgbouncer',
    dependencies: ['pgbouncer'],
  },
  {
    name: 'minio',
    repo: 'minio/minio',
    version: 'latest',
    systemdService: 'minio',
    configPath: '/etc/minio',
    dependencies: ['wget'],
  },
  {
    name: 'storage-api',
    repo: 'supabase/storage',
    version: 'v1.25.3',
    systemdService: 'supabase-storage',
    configPath: '/etc/supabase-storage',
    dependencies: ['nodejs', 'npm'],
  },
  {
    name: 'postgres-meta',
    repo: 'supabase/postgres-meta',
    version: 'v0.91.0',
    systemdService: 'postgres-meta',
    configPath: '/etc/postgres-meta',
    dependencies: ['nodejs', 'npm'],
  },
  {
    name: 'imgproxy',
    repo: 'imgproxy/imgproxy',
    version: 'v3.29.0',
    systemdService: 'imgproxy',
    configPath: '/etc/imgproxy',
    dependencies: ['libvips-tools'],
  },
];

async function checkRoot(): Promise<boolean> {
  try {
    const { stdout } = await execa('id', ['-u']);
    return stdout.trim() === '0';
  } catch {
    return false;
  }
}

async function detectOS(): Promise<{ distro: string; version: string }> {
  try {
    const { stdout } = await execa('lsb_release', ['-is']);
    const distro = stdout.trim().toLowerCase();
    const { stdout: version } = await execa('lsb_release', ['-rs']);
    return { distro, version: version.trim() };
  } catch {
    throw new Error('Could not detect OS. This command requires Ubuntu or Debian.');
  }
}

async function installDependencies(context: CommandContext, deps: string[]): Promise<void> {
  const spinner = ora(`Installing dependencies: ${deps.join(', ')}`).start();
  try {
    await execa('apt-get', ['update']);
    await execa('apt-get', ['install', '-y', ...deps]);
    spinner.succeed();
  } catch (error) {
    spinner.fail();
    throw error;
  }
}

async function downloadGitHubRelease(
  context: CommandContext,
  repo: string,
  version: string,
  outputPath: string
): Promise<void> {
  const spinner = ora(`Downloading ${repo}@${version}`).start();
  try {
    const url = `https://github.com/${repo}/releases/download/${version}/${getAssetName(repo, version)}`;
    await execa('wget', ['-O', outputPath, url]);
    await chmod(outputPath, '755');
    spinner.succeed();
  } catch (error) {
    spinner.fail();
    throw error;
  }
}

function getAssetName(repo: string, version: string): string {
  const repoName = repo.split('/')[1];
  return `${repoName}-linux-amd64`;
}

async function createSystemdService(
  name: string,
  content: string,
  context: CommandContext
): Promise<void> {
  const servicePath = `/etc/systemd/system/${name}.service`;
  await writeFile(servicePath, content, 'utf-8');
  await execa('systemctl', ['daemon-reload']);
  await execa('systemctl', ['enable', name]);
}

async function createPostgreSQLConfig(envVars: Record<string, string>): Promise<void> {
  const initScript = `
-- Create database and user for Supabase Storage
CREATE DATABASE ${envVars['POSTGRES_DB'] || 'storage'};
CREATE USER ${envVars['POSTGRES_USER'] || 'postgres'} WITH ENCRYPTED PASSWORD '${envVars['POSTGRES_PASSWORD']}';
GRANT ALL PRIVILEGES ON DATABASE ${envVars['POSTGRES_DB'] || 'storage'} TO ${envVars['POSTGRES_USER'] || 'postgres'};

-- Create extensions
\\c ${envVars['POSTGRES_DB'] || 'storage'};
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create storage schema
CREATE SCHEMA IF NOT EXISTS storage;
GRANT ALL ON SCHEMA storage TO ${envVars['POSTGRES_USER'] || 'postgres'};
ALTER USER ${envVars['POSTGRES_USER'] || 'postgres'} WITH SUPERUSER;
`;

  await writeFile('/tmp/init-storage.sql', initScript, 'utf-8');
}

async function createPgBouncerConfig(envVars: Record<string, string>): Promise<void> {
  const config = `
[databases]
${envVars['POSTGRES_DB'] || 'storage'} = host=127.0.0.1 port=5432 dbname=${envVars['POSTGRES_DB'] || 'storage'} user=${envVars['POSTGRES_USER'] || 'postgres'} password=${envVars['POSTGRES_PASSWORD']}

[pgbouncer]
listen_port = 6432
listen_addr = 127.0.0.1
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
max_client_conn = 100
default_pool_size = 20
ignore_startup_parameters = extra_float_digits,options
admin_users = ${envVars['POSTGRES_USER'] || 'postgres'}
stats_users = ${envVars['POSTGRES_USER'] || 'postgres'}
`;

  const userlist = `"${envVars['POSTGRES_USER'] || 'postgres'}" "${envVars['POSTGRES_PASSWORD']}"`;

  await mkdir('/etc/pgbouncer', { recursive: true });
  await writeFile('/etc/pgbouncer/pgbouncer.ini', config, 'utf-8');
  await writeFile('/etc/pgbouncer/userlist.txt', userlist, 'utf-8');
  await chmod('/etc/pgbouncer/userlist.txt', '600');
}

async function createMinioConfig(envVars: Record<string, string>): Promise<void> {
  const service = `
[Unit]
Description=MinIO
Documentation=https://docs.min.io
After=network-online.target
Wants=network-online.target

[Service]
Type=notify
Environment="MINIO_ROOT_USER=${envVars['MINIO_ROOT_USER'] || 'supastorj'}"
Environment="MINIO_ROOT_PASSWORD=${envVars['MINIO_ROOT_PASSWORD']}"
Environment="MINIO_VOLUMES=/var/lib/minio/data"
Environment="MINIO_OPTS=--console-address :9001"
ExecStart=/usr/local/bin/minio server $MINIO_OPTS $MINIO_VOLUMES
Restart=always
RestartSec=10s
StandardOutput=journal
StandardError=journal
SyslogIdentifier=minio

[Install]
WantedBy=multi-user.target
`;

  await mkdir('/var/lib/minio/data', { recursive: true });
  await createSystemdService('minio', service, {} as CommandContext);
}

async function createStorageApiConfig(envVars: Record<string, string>): Promise<void> {
  const config = {
    server: {
      port: 5000,
      host: '127.0.0.1',
    },
    database: {
      url: `postgresql://${envVars['POSTGRES_USER'] || 'postgres'}:${envVars['POSTGRES_PASSWORD']}@127.0.0.1:5432/${envVars['POSTGRES_DB'] || 'storage'}`,
      poolUrl: `postgresql://${envVars['POSTGRES_USER'] || 'postgres'}:${envVars['POSTGRES_PASSWORD']}@127.0.0.1:6432/${envVars['POSTGRES_DB'] || 'storage'}`,
    },
    storage: {
      backend: envVars['STORAGE_BACKEND'] || 's3',
      s3: {
        bucket: envVars['STORAGE_S3_BUCKET'] || 'storage',
        endpoint: 'http://127.0.0.1:9000',
        region: envVars['STORAGE_S3_REGION'] || 'us-east-1',
        forcePathStyle: true,
        credentials: {
          accessKeyId: envVars['AWS_ACCESS_KEY_ID'] || envVars['MINIO_ROOT_USER'] || 'supastorj',
          secretAccessKey: envVars['AWS_SECRET_ACCESS_KEY'] || envVars['MINIO_ROOT_PASSWORD'],
        },
      },
      file: {
        path: '/var/lib/supabase-storage',
      },
    },
    auth: {
      jwt: {
        secret: envVars['JWT_SECRET'],
        algorithm: envVars['JWT_ALGORITHM'] || 'HS256',
      },
      anonKey: envVars['ANON_KEY'],
      serviceKey: envVars['SERVICE_KEY'],
    },
    upload: {
      fileSizeLimit: parseInt(envVars['UPLOAD_FILE_SIZE_LIMIT'] || '524288000'),
      fileSizeLimitStandard: parseInt(envVars['UPLOAD_FILE_SIZE_LIMIT_STANDARD'] || '52428800'),
    },
    imageTransformation: {
      enabled: envVars['IMAGE_TRANSFORMATION_ENABLED'] === 'true',
      imgproxyUrl: 'http://127.0.0.1:8080',
    },
    tenant: {
      id: envVars['TENANT_ID'] || 'supastorj',
      region: envVars['REGION'] || 'us-east-1',
    },
  };

  const service = `
[Unit]
Description=Supabase Storage API
After=network.target postgresql.service minio.service

[Service]
Type=simple
User=supabase
Group=supabase
WorkingDirectory=/opt/supabase-storage
Environment="NODE_ENV=production"
Environment="SERVER_PORT=5000"
Environment="AUTH_JWT_SECRET=${envVars['JWT_SECRET']}"
Environment="ANON_KEY=${envVars['ANON_KEY']}"
Environment="SERVICE_KEY=${envVars['SERVICE_KEY']}"
Environment="DATABASE_URL=${config.database.url}"
Environment="DATABASE_POOL_URL=${config.database.poolUrl}"
Environment="STORAGE_BACKEND=${config.storage.backend}"
Environment="STORAGE_S3_BUCKET=${config.storage.s3.bucket}"
Environment="STORAGE_S3_ENDPOINT=${config.storage.s3.endpoint}"
Environment="AWS_ACCESS_KEY_ID=${config.storage.s3.credentials.accessKeyId}"
Environment="AWS_SECRET_ACCESS_KEY=${config.storage.s3.credentials.secretAccessKey}"
ExecStart=/usr/bin/node /opt/supabase-storage/dist/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=supabase-storage

[Install]
WantedBy=multi-user.target
`;

  await mkdir('/etc/supabase-storage', { recursive: true });
  await mkdir('/var/lib/supabase-storage', { recursive: true });
  await writeFile('/etc/supabase-storage/config.json', JSON.stringify(config, null, 2), 'utf-8');
  await createSystemdService('supabase-storage', service, {} as CommandContext);
}

export interface ProdDeployOptions {
  skipDeps?: boolean;
  services?: string;
  dryRun?: boolean;
}

export async function deployProdEnvironment(
  context: CommandContext,
  options: ProdDeployOptions,
  envVars: Record<string, string>
): Promise<void> {
  try {
    // Check if running as root
    if (!await checkRoot() && !options.dryRun) {
      context.logger.error('This command must be run as root (use sudo)');
      process.exit(1);
    }

    // Check OS
    const os = await detectOS();
    if (!['ubuntu', 'debian'].includes(os.distro)) {
      context.logger.error(`Unsupported OS: ${os.distro}. This command requires Ubuntu or Debian.`);
      process.exit(1);
    }

    const spinner = ora();

    // Determine which services to deploy
    let servicesToDeploy = SERVICES;
    if (options.services) {
      const requestedServices = options.services.split(',').map((s: string) => s.trim());
      servicesToDeploy = SERVICES.filter(s => requestedServices.includes(s.name));
    }

    console.log(chalk.cyan('\n🚀 Deploying Supastorj Production Environment\n'));
    console.log('Services to deploy:');
    servicesToDeploy.forEach(s => console.log(`  - ${s.name}`));

    if (options.dryRun) {
      console.log(chalk.yellow('\n⚠️  DRY RUN MODE - No changes will be made\n'));
      return;
    }

    // Install system dependencies
    if (!options.skipDeps) {
      spinner.start('Installing system dependencies...');
      const allDeps = new Set<string>();
      
      // Add PostgreSQL repo
      await execa('sh', ['-c', 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list']);
      await execa('wget', ['--quiet', '-O', '-', 'https://www.postgresql.org/media/keys/ACCC4CF8.asc'], { stdout: 'pipe' })
        .then(({ stdout }) => execa('apt-key', ['add', '-'], { input: stdout }));

      // Add Node.js repo
      await execa('curl', ['-fsSL', 'https://deb.nodesource.com/setup_20.x'], { stdout: 'pipe' })
        .then(({ stdout }) => execa('bash', ['-'], { input: stdout }));

      servicesToDeploy.forEach(s => s.dependencies.forEach(d => allDeps.add(d)));
      await installDependencies(context, Array.from(allDeps));
      spinner.succeed('System dependencies installed');
    }

    // Deploy each service
    for (const service of servicesToDeploy) {
      console.log(chalk.blue(`\n📦 Deploying ${service.name}...`));

      switch (service.name) {
        case 'postgresql': {
          // Configure PostgreSQL
          await createPostgreSQLConfig(envVars);
          await execa('sudo', ['-u', 'postgres', 'psql', '-f', '/tmp/init-storage.sql']);
          
          // Update PostgreSQL config to listen on localhost
          const pgConfig = `/etc/postgresql/${service.version}/main/postgresql.conf`;
          await execa('sed', ['-i', "s/#listen_addresses = 'localhost'/listen_addresses = '127.0.0.1'/g", pgConfig]);
          
          await execa('systemctl', ['restart', 'postgresql']);
          break;
        }

        case 'pgbouncer':
          await createPgBouncerConfig(envVars);
          await execa('systemctl', ['restart', 'pgbouncer']);
          break;

        case 'minio':
          // Download MinIO binary
          await downloadGitHubRelease(context, service.repo, service.version, '/usr/local/bin/minio');
          await createMinioConfig(envVars);
          await execa('systemctl', ['start', 'minio']);
          
          // Create default bucket
          setTimeout(async () => {
            await execa('curl', [
              '-X', 'PUT',
              `http://127.0.0.1:9000/${envVars['STORAGE_S3_BUCKET'] || 'storage'}`,
              '-H', `Host: 127.0.0.1:9000`,
              '-H', `Authorization: AWS ${envVars['MINIO_ROOT_USER'] || 'supastorj'}:${envVars['MINIO_ROOT_PASSWORD']}`,
            ]);
          }, 5000);
          break;

        case 'storage-api':
          // Clone and build storage API
          spinner.start('Building Supabase Storage API...');
          await execa('git', ['clone', `https://github.com/${service.repo}.git`, '/tmp/storage-api']);
          await execa('npm', ['install'], { cwd: '/tmp/storage-api' });
          await execa('npm', ['run', 'build'], { cwd: '/tmp/storage-api' });
          await execa('cp', ['-r', '/tmp/storage-api', '/opt/supabase-storage']);
          
          // Create user
          await execa('useradd', ['-r', '-s', '/bin/false', 'supabase']).catch(() => {});
          await execa('chown', ['-R', 'supabase:supabase', '/opt/supabase-storage']);
          
          await createStorageApiConfig(envVars);
          await execa('systemctl', ['start', 'supabase-storage']);
          spinner.succeed();
          break;

        case 'postgres-meta': {
          // Similar to storage-api
          spinner.start('Building Postgres Meta...');
          await execa('git', ['clone', `https://github.com/${service.repo}.git`, '/tmp/postgres-meta']);
          await execa('npm', ['install'], { cwd: '/tmp/postgres-meta' });
          await execa('npm', ['run', 'build'], { cwd: '/tmp/postgres-meta' });
          await execa('cp', ['-r', '/tmp/postgres-meta', '/opt/postgres-meta']);
          
          const metaService = `
[Unit]
Description=Postgres Meta
After=network.target postgresql.service

[Service]
Type=simple
User=supabase
Group=supabase
WorkingDirectory=/opt/postgres-meta
Environment="NODE_ENV=production"
Environment="PG_META_PORT=8080"
Environment="PG_META_DB_HOST=127.0.0.1"
Environment="PG_META_DB_PORT=5432"
Environment="PG_META_DB_NAME=${envVars['POSTGRES_DB'] || 'storage'}"
Environment="PG_META_DB_USER=${envVars['POSTGRES_USER'] || 'postgres'}"
Environment="PG_META_DB_PASSWORD=${envVars['POSTGRES_PASSWORD']}"
ExecStart=/usr/bin/node /opt/postgres-meta/dist/server.js
Restart=always

[Install]
WantedBy=multi-user.target
`;
          await createSystemdService('postgres-meta', metaService, context);
          await execa('systemctl', ['start', 'postgres-meta']);
          spinner.succeed();
          break;
        }

        case 'imgproxy':
          if (envVars['IMAGE_TRANSFORMATION_ENABLED'] === 'true') {
            await downloadGitHubRelease(context, service.repo, service.version, '/usr/local/bin/imgproxy');
            
            const imgproxyService = `
[Unit]
Description=imgproxy
After=network.target

[Service]
Type=simple
Environment="IMGPROXY_BIND=:8080"
Environment="IMGPROXY_LOCAL_FILESYSTEM_ROOT=/var/lib/supabase-storage"
Environment="IMGPROXY_USE_ETAG=true"
ExecStart=/usr/local/bin/imgproxy
Restart=always

[Install]
WantedBy=multi-user.target
`;
            await createSystemdService('imgproxy', imgproxyService, context);
            await execa('systemctl', ['start', 'imgproxy']);
          }
          break;
          
        default:
          context.logger.warn(`Unknown service: ${service.name}`);
          break;
      }

      console.log(chalk.green(`✅ ${service.name} deployed successfully`));
    }

    // Show status
    console.log(chalk.green('\n✅ Production deployment completed successfully!\n'));
    console.log('Service status:');
    for (const service of servicesToDeploy) {
      try {
        const { stdout } = await execa('systemctl', ['is-active', service.systemdService]);
        console.log(`  ${service.name.padEnd(20)} ${stdout.trim() === 'active' ? chalk.green('●') : chalk.red('●')} ${stdout.trim()}`);
      } catch {
        console.log(`  ${service.name.padEnd(20)} ${chalk.yellow('●')} not found`);
      }
    }

    console.log(chalk.gray('\nUse "systemctl status <service>" to check individual services'));
    console.log(chalk.gray('Logs: "journalctl -u <service> -f"'));

  } catch (error: any) {
    context.logger.error('Deployment failed:', error.message);
    process.exit(1);
  }
}