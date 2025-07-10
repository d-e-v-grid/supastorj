# Supastorj — Modern DevOps Platform for Supabase Storage

## Overview

**Supastorj** is a modern DevOps platform for autonomous and flexible management of object storage based on Supabase Storage and PostgreSQL. Designed for self-hosted and enterprise deployments, it provides a comprehensive toolkit for deploying, managing, and scaling Supabase Storage infrastructure with emphasis on security, scalability, and ease of use.

---

## Overall Architecture

```
┌────────────┐       ┌─────────────────┐       ┌────────────────┐
│            │       │                 │       │                │
│  CLI       │<----->│   Backend API   │<----->│   Dashboard    │
│ (Ink, TUI) │       │  (REST/GraphQL) │       │  (React, MUI)  │
└─────▲──────┘       └──────▲──────────┘       └────▲───────────┘
      │                   │                            │
      │                   ▼                            ▼
      │          ┌──────────────────┐       ┌──────────────────────┐
      └--------->│   Supabase       │<----->│  Postgres-meta API   │
                 │   Storage API    │       └──────────────────────┘
                 └------------------┘
```

---

## Quick Start

```bash
# Install globally
npm install -g @supastorj/cli

# Initialize a new project
supastorj init

# Development mode (Docker)
supastorj up

# Production mode (Bare metal)
sudo supastorj deploy

# Check service status
supastorj status

# View logs
supastorj logs -f
```

## Architecture Components

### 1. **CLI Utility (apps/cli)** — Currently Implemented

* **Implementation:** TypeScript, Ink (React-based TUI), Commander.js
* **Features:**

  * Interactive project initialization with template scaffolding
  * Docker Compose-based service orchestration
  * Real-time service health monitoring
  * Log streaming and aggregation
  * Configuration management with environment inheritance
  * Plugin-based architecture for extensibility
  * Global installation support for system-wide usage

### 2. **Backend API Server (apps/admin-api)** — Planned

* **Implementation:** TypeScript/Node.js (Fastify/NestJS)
* **Planned Features:**

  * RESTful and GraphQL APIs for programmatic access
  * Authentication and authorization with JWT
  * Audit logging for all operations
  * WebSocket support for real-time updates
  * Integration layer for Supabase Storage and postgres-meta

### 3. **Dashboard Panel (apps/dashboard)** — Planned

* **Implementation:** React, Material-UI, Next.js
* **Planned Features:**

  * Web-based administrative interface
  * Real-time service monitoring dashboard
  * Bucket and object management UI
  * User and permission management
  * Log viewing and analysis tools

### 4. **Supabase Storage**

* **Deployment:** Docker container or baremetal
* **Tasks:**

  * Physical storage of bucket/object
  * RLS and ACL at Postgres level
  * Support for production optimizations (functions, indexes, scalability)

### 5. **Postgres-meta**

* **Deployment:** Docker container or bare metal
* **Tasks:**

  * REST API for managing Postgres schema (tables, RLS, roles, policies)
  * Used by CLI and backend for dynamic access management

---

## Interaction Flow

1. **CLI** manages services and infrastructure, generates environment, migrations, and starts all services.
2. **Backend API** serves as the core of all business logic, integrates storage and postgres-meta, implements audit and access management.
3. **Dashboard** — visual tool for admins, working through backend API and providing all operations in UI.
4. **Supabase Storage** and **postgres-meta** provide physical storage and schema/rights management at the data level.

---

## Deployment Modes

### Development Mode (Docker)
- Uses docker-compose for easy local development
- All services run in containers
- Port forwarding to localhost
- Hot reloading support

### Production Mode (Bare Metal)
- Direct installation on Ubuntu/Debian servers
- Systemd service management
- Optimized for performance
- Suitable for production workloads

## Scalability and Security

* **All services are deployed and scaled through CLI** (docker-compose for dev, systemd for prod).
* **Backend API** and Dashboard have strict authorization, all actions are logged (audit).
* **Storage of secrets and configs** — only in secured .env/secrets/vault, automated by CLI.
* **Horizontal scaling** for Storage and postgres-meta (Docker Swarm, K8s, LB), preparation for multi-region.

---

## Current Services Stack

The platform manages the following services out of the box:

- **PostgreSQL 16** - Primary database with custom configurations
- **PgBouncer** - Connection pooling for better performance
- **MinIO** - S3-compatible object storage backend
- **Supabase Storage API** - Core storage service
- **Postgres-meta** - Database schema management API
- **imgproxy** - On-the-fly image transformation service
- **Redis** (optional) - Caching and rate limiting

## Requirements

- Node.js >= 20 (CLI), >= 22 (root monorepo)
- Docker and Docker Compose
- Yarn 4.x (for development)

## Development

```bash
# Clone the repository
git clone https://github.com/yourusername/supastorj.git
cd supastorj

# Install dependencies
yarn install

# Build all packages
yarn build

# Run tests
yarn test

# Create global link for development
yarn link:global
```

## CLI Commands

- `supastorj init` - Initialize a new project
- `supastorj up` - Start all services (Docker mode)
- `supastorj down` - Stop all services
- `supastorj status` - Show service status
- `supastorj logs` - View service logs
- `supastorj deploy` - Deploy on bare metal (production mode)
- `supastorj --help` - Show help information

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests to our repository.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
