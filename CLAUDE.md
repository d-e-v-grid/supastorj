# Supastorj Project Guide

Modern DevOps platform for autonomous management of object storage based on Supabase Storage and PostgreSQL.

## Quick Start

```bash
git clone <repository>
cd supastorj
yarn install
yarn dev
```

## Technology Stack

- **TypeScript** - Strict mode enabled
- **Node.js** - v22+ (root), v20+ (CLI)
- **Yarn 4.x** - Workspaces + Turborepo
- **Commander.js** - CLI framework
- **Ink** - React-based TUI
- **Clack** - Interactive prompts
- **Vitest** - Testing (80% coverage)
- **Docker** - Container management
- **Zod** - Schema validation
- **Pino** - Structured logging

## Project Structure

```
supastorj/
├── apps/
│   └── cli/
│       ├── src/
│       │   ├── cli/         # Entry point
│       │   ├── commands/    # CLI commands
│       │   ├── components/  # React/Ink UI
│       │   ├── config/      # Configuration
│       │   ├── core/        # Core services
│       │   ├── adapters/    # External services
│       │   ├── types/       # TypeScript types
│       │   └── utils/       # Utilities
│       ├── templates/       # Docker & systemd templates
│       └── tests/          # Test files
├── packages/               # Shared packages
├── docs/                   # Architecture docs
└── scripts/                # Build scripts
```

## Development Commands

### Root Commands
```bash
yarn dev            # Run all packages
yarn build          # Build all packages
yarn test           # Run all tests
yarn typecheck      # Type checking
yarn lint           # Run ESLint
yarn fix:all        # Fix lint + format
yarn link:global    # Install CLI globally
```

### CLI Development
```bash
cd apps/cli
yarn dev            # Hot reload
yarn test           # Run tests
yarn test:coverage  # With coverage
yarn build          # Production build
```

## Coding Standards

### File Naming
- **TypeScript**: `kebab-case.ts`
- **Tests**: `[name].test.ts`
- **React**: `component-name.tsx`

### Imports
```typescript
// External (sorted by length)
import { z } from 'zod';
import { join } from 'path';

// Internal (always .js extension)
import { Environment } from '../types/index.js';
```

### Code Style
- Semicolons: Always
- Quotes: Single
- Indent: 2 spaces
- Line width: 120
- Async/await preferred

### TypeScript
- Strict mode enabled
- Use `.js` extension for imports
- Prefer interfaces
- Use Zod for validation
- Centralize types in `types/index.ts`

### Testing
```typescript
describe('ComponentName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should work correctly', () => {
    // test
  });
});
```

### Logging
```typescript
context.logger.info('Starting', { service });
context.logger.error('Failed:', error.message);
context.logger.audit('action', { userId });
```

## Architecture

- **Service Management** - Centralized lifecycle management
- **Event-Driven** - Decoupled communication
- **Adapter Pattern** - External services
- **Command Pattern** - Modular CLI

## Configuration

- **Unified config**: `.supastorj/config.json` for all deployment modes
- **Environment modes**: development, production (staging removed)
- **Service details**: Production mode saves connection info in config
- **Environment variables**: Managed via `.env` file

## Services

1. **PostgreSQL 16** - Database
2. **PgBouncer** - Connection pooling
3. **MinIO** - S3 storage
4. **Supabase Storage** - Storage API
5. **Postgres-meta** - Schema management (port 5001)
6. **imgproxy** - Image transformation
7. **Redis** - Caching (optional)

## Common Tasks

### New CLI Command
1. Create file in `src/commands/`
2. Implement command interface
3. Register in CLI router
4. Add tests

### New Service
1. Define configuration schema
2. Create adapter
3. Add Docker template
4. Update types
5. Add health checks

## Troubleshooting

### Import Errors
Ensure `.js` extension on local imports

### Type Errors
Run `yarn typecheck`

### Test Failures
Check for unmocked dependencies

### Build Errors
```bash
yarn clean && yarn build
```

## CLI Commands

### Available Commands
- `init` - Initialize new project (`--mode dev/prod`, `--image-transform`)
- `start` - Start services (`--attach` for foreground mode)
- `stop` - Stop services (`--volumes`, `--images` for cleanup)
- `status` - Show service status (`--json`, `--watch`)
- `logs` - View logs (`--follow`, `--service <name>`)

### Production Mode
- Runs Storage API and Postgres Meta as systemd services
- Connects to existing PostgreSQL and S3 infrastructure
- PID tracking in `.supastorj/` directory
- Support for attached/detached modes

## Future Components

- **admin-api** - REST/GraphQL backend
- **dashboard** - React web UI
- **sdk** - Client libraries