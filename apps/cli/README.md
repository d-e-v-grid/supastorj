# Supastorj CLI

The official command-line interface for Supastorj - a DevOps platform for managing Supabase Storage deployments.

## Features

- **Project Initialization**: Quickly scaffold new Supastorj projects with sensible defaults
- **Service Management**: Start, stop, and monitor Docker-based services
- **Interactive TUI**: Rich terminal UI built with Ink for real-time monitoring
- **Configuration Management**: YAML-based configuration with environment inheritance
- **Plugin System**: Extend functionality with custom plugins
- **Audit Logging**: Track all operations for compliance and debugging
- **Multi-Environment**: Support for development, staging, and production environments

## Installation

### From Source

```bash
# Clone the repository
git clone https://github.com/yourusername/supastorj.git
cd supastorj

# Install dependencies
yarn install

# Build the CLI
yarn workspace @supastorj/cli build

# Link globally (optional)
npm link ./apps/cli
```

### Usage

```bash
# Initialize a new project
supastorj init

# Start services
supastorj up

# View service status
supastorj status

# View logs
supastorj logs [service-name]

# Stop services
supastorj down

# Help
supastorj --help
```

## Architecture

The CLI is built with a modular architecture:

- **Core**: Event bus, logger, plugin manager
- **Adapters**: Docker, Storage API, Postgres Meta
- **Commands**: Modular command implementations
- **Components**: Reusable Ink UI components
- **Config**: Configuration management and validation

## Development

```bash
# Run in development mode
yarn workspace @supastorj/cli dev

# Run tests
yarn workspace @supastorj/cli test

# Type checking
yarn workspace @supastorj/cli typecheck

# Linting
yarn workspace @supastorj/cli lint
```

## Plugin Development

Create a plugin by implementing the Plugin interface:

```typescript
import { Plugin, PluginContext, PluginType } from '@supastorj/cli';

export const myPlugin: Plugin = {
  name: 'my-plugin',
  version: '1.0.0',
  type: PluginType.Command,
  
  async init(context: PluginContext) {
    context.registerCommand({
      name: 'my-command',
      description: 'My custom command',
      action: async (ctx) => {
        ctx.logger.info('Hello from my plugin!');
      },
    });
  },
};
```

## Configuration

Supastorj uses a YAML configuration file (`supastorj.config.yaml`):

```yaml
version: "1.0"
environments:
  development:
    name: development
    services:
      postgres:
        image: postgres:16
        ports:
          - "5432:5432"
      storage:
        image: supabase/storage-api:latest
        ports:
          - "5000:5000"
  production:
    extends: development
    services:
      storage:
        environment:
          LOG_LEVEL: info
```

## License

MIT