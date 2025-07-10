# Supastorj Project Context

## Project Overview

**Supastorj** is a modern DevOps platform for autonomous and flexible management of object storage based on Supabase Storage and PostgreSQL. It's designed as a monorepo using Yarn workspaces and Turborepo, providing a comprehensive toolkit for deploying, managing, and scaling Supabase Storage infrastructure.

## Repository Structure

```
supastorj/
├── apps/
│   └── cli/                    # CLI application (@supastorj/cli)
│       ├── bin/                # CLI entry point
│       ├── src/
│       │   ├── adapters/       # Docker and service adapters
│       │   ├── cli/            # CLI initialization
│       │   ├── commands/       # Command implementations
│       │   ├── components/     # Ink TUI components
│       │   ├── config/         # Configuration management
│       │   ├── core/           # Core services (logger, event bus, plugins)
│       │   └── types/          # TypeScript definitions
│       ├── templates/          # Docker compose templates
│       └── tests/              # Test suite
├── packages/                   # Shared packages (currently empty)
├── docs/                       # Architecture documentation
└── scripts/                    # Build and maintenance scripts
```

## Tech Stack

### Core Technologies
- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js >= 22 (monorepo), >= 20 (CLI)
- **Package Manager**: Yarn 4.9.2 with workspaces
- **Build System**: Turborepo

### CLI Technologies
- **Framework**: Commander.js for command parsing
- **TUI**: Ink (React for terminal)
- **Prompts**: @clack/prompts for interactive inputs
- **Docker**: Dockerode for container management
- **Validation**: Zod for schema validation
- **Logging**: Winston
- **Testing**: Vitest

### Infrastructure Stack
- **PostgreSQL 16**: Primary database
- **PgBouncer**: Connection pooling
- **MinIO**: S3-compatible storage (optional)
- **Supabase Storage API**: Core storage service
- **Postgres-meta**: Database management API
- **imgproxy**: Image transformation (optional)
- **Redis**: Caching (optional)

## Key Commands

### CLI Commands
- `supastorj deploy` - Deploy environment (dev/prod) - initializes project and configuration
- `supastorj up` - Start services
- `supastorj down` - Stop services
- `supastorj status` - Show service status (TUI dashboard)
- `supastorj logs` - View service logs
- `supastorj debug` - Debug information

### Development Commands
- `yarn dev` - Start development mode
- `yarn build` - Build all packages
- `yarn test` - Run tests
- `yarn lint` - Run linting
- `yarn typecheck` - Type checking

## Architecture Highlights

### Plugin System
- Extensible command architecture
- Plugin types: Command, Service, UI, Hook
- Event-driven communication
- Dynamic plugin loading

### Configuration Management
- YAML-based configuration (`supastorj.config.yaml`)
- Environment inheritance
- Multiple environment support (dev/staging/prod)
- Secure secret generation

### Service Management
- Docker Compose orchestration for development
- Bare metal deployment for production
- Health check monitoring
- Real-time log streaming
- Service scaling support

## Recent Changes

### PostgreSQL Authentication Fix
- Added explicit environment variable passing to `storage` and `postgres-meta` containers
- Updated initialization SQL script to ensure proper permissions
- Fixed authentication issues between services

### Docker Compose Updates
- Enhanced service dependency management
- Improved health check configurations
- Added explicit environment variable declarations

## Current Development Status

### Implemented
- ✅ CLI with all core commands
- ✅ Docker-based service orchestration
- ✅ Interactive TUI for status monitoring
- ✅ Configuration management
- ✅ Plugin architecture
- ✅ Audit logging
- ✅ Multi-environment support

### Planned
- 🔲 Backend API server (REST/GraphQL)
- 🔲 Web dashboard (React/MUI)
- 🔲 Kubernetes operator
- 🔲 Multi-region support
- 🔲 Advanced monitoring

## Development Guidelines

### Code Style
- TypeScript with strict mode
- ESLint + Prettier for formatting
- No inline comments unless requested
- Follow existing patterns in codebase

### Testing
- Unit tests with Vitest
- Coverage reporting
- Integration tests for critical paths

### Git Workflow
- Conventional commits
- Feature branches
- PR-based development

## Important Files

- `/apps/cli/src/commands/` - CLI command implementations
- `/apps/cli/templates/docker-compose.yml` - Service definitions
- `/apps/cli/src/config/config-manager.ts` - Configuration logic
- `/apps/cli/src/adapters/docker-adapter.ts` - Docker integration
- `/docs/ARCHITECTURE.md` - Detailed architecture documentation

## Environment Variables

Key environment variables managed by the system:
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` - Database credentials
- `JWT_SECRET`, `ANON_KEY`, `SERVICE_KEY` - Authentication keys
- `STORAGE_BACKEND` - Storage backend (file/s3)
- `IMAGE_TRANSFORMATION_ENABLED` - Enable imgproxy service

## Notes for Development

1. The project uses ESM modules (type: "module")
2. Commands must have proper error handling and logging
3. All async operations should be properly awaited
4. Docker Compose v2 is preferred over v1
5. Services should have health checks configured
6. Sensitive data must never be logged

## Contact & Support

- Repository: https://github.com/d-e-v-grid/supastorj
- Author: DevGrid
- License: MIT