# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Supastor is a modern DevOps platform for managing Supabase Storage with a monorepo architecture using Yarn workspaces and Turbo. The project is written in TypeScript and provides a comprehensive CLI tool for managing self-hosted Supabase Storage deployments.

## Development Commands

### Root Level Commands
- `yarn dev` - Start all services in development mode with hot reloading
- `yarn build` - Build all packages using Turbo
- `yarn test` - Run all tests across the monorepo
- `yarn lint` - Lint all TypeScript files
- `yarn lint:fix` - Auto-fix linting issues
- `yarn fm:check` - Check Prettier formatting
- `yarn fm:fix` - Auto-fix formatting issues
- `yarn fix:all` - Run both lint and format fixes
- `yarn link:global` - Create global npm link for testing CLI
- `yarn unlink:global` - Remove global npm link

### CLI Development (apps/cli)
- `yarn dev` - Start CLI in watch mode
- `yarn build` - Build CLI and make executable
- `yarn test` - Run Vitest tests
- `yarn test:coverage` - Run tests with coverage
- `yarn typecheck` - Run TypeScript type checking

### Running Tests
- Single test file: `yarn test path/to/test.ts`
- Watch mode: `yarn test --watch`
- Coverage: `yarn test:coverage`

## Architecture Overview

### Monorepo Structure
```
/apps
  /cli          - Interactive CLI with TUI (Ink/React)
  /admin-api    - Backend REST/GraphQL API server (planned)
  /dashboard    - React admin dashboard (planned)
/packages       - Shared packages
/contrib        - Docker configurations for services
/storage-repo   - Supabase Storage source code
```

### Key Components

1. **CLI (apps/cli)** - TypeScript, Ink TUI, Commander.js
   - Interactive terminal UI for DevOps tasks
   - Docker/compose management via dockerode
   - Plugin-based architecture for extensibility
   - Event-driven system with EventBus
   - Implemented Commands:
     - `init` - Initialize new project with templates
     - `up` - Start services with health checks
     - `down` - Stop services
     - `status` - Show service status (with watch mode)
     - `logs` - View service logs

2. **Docker Integration**
   - Manages complete Supabase Storage stack:
     - PostgreSQL 16 with custom configuration
     - PgBouncer for connection pooling
     - MinIO for S3-compatible storage
     - Supabase Storage API
     - Postgres-meta for schema management
     - imgproxy for image transformations
     - Redis for caching (optional)

3. **Configuration System**
   - Hierarchical YAML configuration
   - Environment variable interpolation
   - Environment inheritance (dev/staging/prod)
   - Zod schema validation
   - Default configurations for quick start

### Core Patterns

- **Event System**: Decoupled communication via EventBus
  - Supports sync/async handlers
  - Once listeners and waitFor promises
  - Error isolation per handler

- **Plugin Manager**: Extensible architecture
  - Auto-discovery from configured paths
  - Support for command, service, UI, and hook plugins
  - Dynamic loading/unloading
  - Plugin context isolation

- **Config Management**: Hierarchical config with Zod validation
  - Environment inheritance (child overrides parent)
  - Variable interpolation from .env and process.env
  - Service-specific configurations
  - Type-safe validation

- **Docker Adapter**: Container lifecycle management
  - Health check monitoring
  - Log streaming with proper formatting
  - Container info and status tracking
  - Error handling with meaningful messages

### Important Files
- Main CLI entry: apps/cli/src/cli/index.ts
- Commands: apps/cli/src/commands/*.ts
- Docker templates: apps/cli/templates/*.yml
- Architecture docs: docs/ARCHITECTURE.md
- Type definitions: apps/cli/src/types/index.ts

## Key Dependencies
- Node.js >= 20 (CLI), >= 22 (root)
- Yarn 4 with workspaces
- TypeScript 5.x with strict mode
- Turbo for monorepo builds
- Vitest for testing
- ESLint + Prettier for code quality
- Docker/Docker Compose for service orchestration

## Common Issues and Solutions

### Postgres Container Restarting
- Check postgres configuration files in templates/config/postgres/
- Ensure proper permissions and valid SQL in init scripts
- Review healthcheck configuration

### Docker Image Versions
- Use specific versions instead of 'latest' tags
- Current versions:
  - postgres:16-alpine
  - supabase/storage-api:v1.13.1
  - supabase/postgres-meta:v0.89.3
  - darthsim/imgproxy:v3.24

### Error Output Formatting
- Errors from docker-compose are properly formatted in up/down commands
- stderr/stdout are parsed and logged with appropriate levels

## Security Notes
- All secrets in .env files or environment variables
- JWT secrets auto-generated during init
- Secure key generation using crypto.randomBytes
- Audit logging for all operations
- Docker security best practices
- No hardcoded credentials

## Future Enhancements
- Admin API for programmatic access
- Web dashboard for visual management
- Kubernetes support
- Multi-region deployments
- Advanced monitoring and metrics
- Backup/restore functionality