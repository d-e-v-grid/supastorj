# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Bare metal deployment support with `supastorj deploy` command
- Systemd service management for production deployments
- Two deployment modes: Docker (dev) and Bare Metal (prod)
- PostgreSQL authentication fix for container environments

### Changed
- Simplified Docker setup to single docker-compose.yml file
- Updated PostgreSQL authentication configuration
- Improved environment variable handling in containers
- Updated README with deployment modes documentation

### Removed
- Removed docker-compose.prod.yml and docker-compose.monitoring.yml
- Removed unused PostgreSQL configuration files (pg_hba.conf, postgresql.conf)

## [0.2.0] - 2025-01-10

### Added
- Initial monorepo structure with Yarn workspaces
- Base configuration files (TypeScript, ESLint, Prettier)
- Project architecture documentation
- CLI development guide specification
- Created `apps/cli` workspace for the Supastorj CLI tool
- Created `scripts/` directory for build and deployment scripts
- Implemented core CLI architecture components:
  - Event bus system for decoupled communication
  - Logger with audit logging support
  - Configuration manager with environment inheritance
  - Plugin manager for extensibility
  - Main CLI entry point with command routing
- Comprehensive type definitions for the entire system
- Improved architecture documentation with detailed component descriptions
- Docker adapter for container management
- Fully implemented CLI commands:
  - `init` command with project scaffolding and template support
  - `up` command with health checks and detached/attached modes
  - `down` command with volume and image cleanup options
  - `status` command with JSON output and watch mode
  - `logs` command with follow mode and filtering
- Build script for the monorepo
- TUI components:
  - StatusDashboard component for service monitoring
- Enhanced Docker Compose configurations:
  - Production-ready docker-compose.yml with MinIO S3 backend
  - Production docker-compose.prod.yml with external S3 and monitoring
  - Optional monitoring stack with Prometheus, Grafana, and Jaeger
  - PgBouncer for connection pooling
  - Redis for caching and rate limiting
  - Comprehensive health checks and resource limits
- Updated configuration management to support new services
- Environment variable generation for all services
- Test infrastructure with Vitest
- Example unit tests for event bus
- Global npm link commands for local development testing
- Executable bin file for global CLI usage

### Changed
- Enhanced architecture design with modular plugin system
- Improved configuration management with environment inheritance
- Added event-driven architecture for better extensibility
- Updated all dependencies to latest versions:
  - @clack/prompts: ^0.7.0 → ^0.8.2
  - commander: ^12.0.0 → ^12.1.0
  - execa: ^8.0.1 → ^9.5.1
  - ink: ^4.4.1 → ^5.0.1
  - react: ^18.2.0 → ^18.3.1
  - winston: ^3.11.0 → ^3.16.0
  - zod: ^3.22.4 → ^3.24.1
  - typescript: ^5.3.3 → ^5.7.2
  - vitest: ^1.2.1 → ^2.1.8
  - And other dependencies
- Upgraded Node.js requirement from >=18.0.0 to >=20.0.0
- Updated TypeScript configuration for ES2023 target
- Enhanced TypeScript strict mode with additional checks
- Updated Docker Compose template to use PostgreSQL 17
- Fixed naming consistency (Supastorj → Supastorj)

### Fixed
- Fixed TypeScript build errors:
  - js-yaml import syntax (changed from named imports to namespace import)
  - Docker adapter log streaming types and async iterator handling
  - process.env property access with bracket notation for strict mode
  - Removed duplicate helper functions in StatusDashboard
  - Fixed parseInt calls with proper undefined handling
  - Fixed React/JSX usage in status command
- Fixed Docker adapter log handling for follow/non-follow modes
- Fixed all TypeScript strict mode compliance issues
- Fixed Commander.js exitOverride error handling for help/version commands
- Fixed error output formatting in up/down commands (was showing as object with indices)
- Updated Docker image versions to use specific tags instead of 'latest'
- Removed deprecated 'version' attribute from docker-compose.yml

### Removed
- Removed `scripts/build.sh` in favor of using `turbo build` from turborepo

### Security
- Implemented secure secret management patterns
- Added audit logging infrastructure with structured logging

## [0.1.0] - 2025-01-08

### Added
- Initial project setup
- Basic monorepo configuration