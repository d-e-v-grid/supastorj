# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.1] - 2025-01-11

### Changed
- **CLI**: Simplified deployment modes - removed staging environment, now only supports development and production
- **CLI**: Improved service management with new centralized `service-manager.ts` utility
- **CLI**: Enhanced production mode with multi-service support (Storage API + Postgres Meta)
- **CLI**: Changed default behavior of start command - detached mode is now default
- **CLI**: Postgres Meta API port changed from 8080 to 5001 to avoid common conflicts
- **CLI**: Better systemd integration with proper PID tracking and service status monitoring
- **CLI**: Improved logger integration with new `prompt-wrapper.ts` to handle conflicts with interactive prompts

### Added
- **CLI**: Support for Postgres Meta API as a manageable service in production mode
- **CLI**: New systemd service template `supastorj-postgres-meta.service`
- **CLI**: `--attach` flag for start command to run services in foreground mode
- **CLI**: `--image-transform` flag for init command (replaced inverted `--no-image-transform`)
- **CLI**: Logger methods: `silence()`, `unsilence()`, and `flush()` for better prompt integration
- **CLI**: Service discovery using PID files in `.supastorj/` directory

### Fixed
- **CLI**: Conflicts between logger output and interactive prompts (Clack/Ink)
- **CLI**: Production status command now shows all enabled services correctly
- **CLI**: Better error handling and user feedback during service operations
- **CLI**: Proper MainPID capture in systemd services for accurate status tracking

### Removed
- **CLI**: Plugin system entirely (`plugin-manager.ts` and related types)
- **CLI**: `--skip-deps` flag from init command
- **CLI**: `--detach` flag from start command (detached is now default)
- **CLI**: `README-DEPLOYMENT.md` template
- **CLI**: Test shell scripts from `test-unified/` directory

## [0.2.0] - 2025-01-11

### Breaking Changes
- **CLI Commands**: Renamed commands for better clarity:
  - `deploy` → `init` (project initialization)
  - `up` → `start` (start services)
  - `down` → `stop` (stop services)

### Added
- **CLI**: Production environment initialization templates
  - `.env.storage` template for environment variables
  - `.gitignore` template for project repositories
  - `README.md` and `README-DEPLOYMENT.md` templates
  - `supastorj.service` systemd service template
  - Shell scripts for starting/stopping storage services
- **CLI**: Test utilities module for shared test helpers
- **CLI**: ESLint ignore file for better linting control
- **CLI**: CLAUDE.md project guide with comprehensive documentation

### Changed
- **CLI**: Simplified production deployment for existing infrastructure
- **CLI**: Enhanced configuration manager with better error handling
- **CLI**: Improved logger with structured output formatting
- **CLI**: Updated status dashboard with better service monitoring
- **CLI**: Refactored Docker adapter for improved reliability
- **CLI**: Enhanced test coverage with new test utilities

### Fixed
- **CLI**: Fixed import statements to use proper `.js` extensions
- **CLI**: Fixed test file organization and naming conventions
- **CLI**: Fixed TypeScript configuration for better module resolution
- **CLI**: Fixed event bus implementation for better type safety
- **CLI**: Fixed plugin manager initialization sequence

### Removed
- **CLI**: Removed unused `init.imageTransform.test.ts` test file
- **CLI**: Removed legacy `deploy/prod-environment.ts` in favor of new structure

## [0.2.0] - 2025-01-10

### Added
- **CLI**: Bare metal deployment support with `supastorj deploy` command
- **CLI**: Systemd service management for production deployments
- **CLI**: Two deployment modes: Docker (dev) and Bare Metal (prod)
- **CLI**: PostgreSQL authentication fix for container environments
- **CLI**: Docker adapter for container management
- **CLI**: Fully implemented CLI commands:
  - `init` command with project scaffolding and template support
  - `up` command with health checks and detached/attached modes
  - `down` command with volume and image cleanup options
  - `status` command with JSON output and watch mode
  - `logs` command with follow mode and filtering
- **CLI**: TUI components with StatusDashboard for service monitoring
- **CLI**: Enhanced Docker Compose configurations:
  - Production-ready docker-compose.yml with MinIO S3 backend
  - Production docker-compose.prod.yml with external S3 and monitoring
  - Optional monitoring stack with Prometheus, Grafana, and Jaeger
  - PgBouncer for connection pooling
  - Redis for caching and rate limiting
  - Comprehensive health checks and resource limits
- **CLI**: Test infrastructure with Vitest and example unit tests
- **CLI**: Global npm link commands for local development testing
- **CLI**: Executable bin file for global CLI usage
- **Monorepo**: Initial monorepo structure with Yarn workspaces
- **Monorepo**: Base configuration files (TypeScript, ESLint, Prettier)
- **Monorepo**: Project architecture documentation
- **Monorepo**: CLI development guide specification
- **Monorepo**: Created `apps/cli` workspace for the Supastorj CLI tool
- **Monorepo**: Created `scripts/` directory for build and deployment scripts
- **Monorepo**: Implemented core CLI architecture components:
  - Event bus system for decoupled communication
  - Logger with audit logging support
  - Configuration manager with environment inheritance
  - Plugin manager for extensibility
  - Main CLI entry point with command routing
- **Monorepo**: Comprehensive type definitions for the entire system
- **Monorepo**: Improved architecture documentation with detailed component descriptions
- **Monorepo**: Build script for the monorepo
- **Monorepo**: Updated configuration management to support new services
- **Monorepo**: Environment variable generation for all services

### Changed
- **CLI**: Simplified Docker setup to single docker-compose.yml file
- **CLI**: Updated PostgreSQL authentication configuration
- **CLI**: Improved environment variable handling in containers
- **CLI**: Updated README with deployment modes documentation
- **CLI**: Updated all dependencies to latest versions
- **CLI**: Upgraded Node.js requirement from >=18.0.0 to >=20.0.0
- **CLI**: Updated TypeScript configuration for ES2023 target
- **CLI**: Enhanced TypeScript strict mode with additional checks
- **CLI**: Updated Docker Compose template to use PostgreSQL 17
- **Monorepo**: Enhanced architecture design with modular plugin system
- **Monorepo**: Improved configuration management with environment inheritance
- **Monorepo**: Added event-driven architecture for better extensibility
- **Monorepo**: Fixed naming consistency (Supastorj → Supastorj)

### Fixed
- **CLI**: Fixed TypeScript build errors:
  - js-yaml import syntax (changed from named imports to namespace import)
  - Docker adapter log streaming types and async iterator handling
  - process.env property access with bracket notation for strict mode
  - Removed duplicate helper functions in StatusDashboard
  - Fixed parseInt calls with proper undefined handling
  - Fixed React/JSX usage in status command
- **CLI**: Fixed Docker adapter log handling for follow/non-follow modes
- **CLI**: Fixed all TypeScript strict mode compliance issues
- **CLI**: Fixed Commander.js exitOverride error handling for help/version commands
- **CLI**: Fixed error output formatting in up/down commands (was showing as object with indices)
- **CLI**: Updated Docker image versions to use specific tags instead of 'latest'
- **CLI**: Removed deprecated 'version' attribute from docker-compose.yml

### Removed
- **CLI**: Removed docker-compose.prod.yml and docker-compose.monitoring.yml
- **CLI**: Removed unused PostgreSQL configuration files (pg_hba.conf, postgresql.conf)
- **Monorepo**: Removed `scripts/build.sh` in favor of using `turbo build` from turborepo

### Security
- **CLI**: Implemented secure secret management patterns
- **CLI**: Added audit logging infrastructure with structured logging

## [0.1.0] - 2025-01-08

### Added
- **Monorepo**: Initial project setup
- **Monorepo**: Basic monorepo configuration