# Supastorj Project — Architecture and Components

## Brief Description

**supastorj** is a modern DevOps platform for autonomous and flexible management of object storage based on Supabase Storage and Postgres, with emphasis on security, scalability, and ease of integration into any infrastructure. The system is designed for self-hosted and enterprise deployments, combining a powerful CLI, convenient admin panel, and API server in a unified architecture.

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

## Architecture Components

### 1. **CLI Utility (apps/cli)**

* **Implementation:** TypeScript, Ink (React-like TUI)
* **Tasks:**

  * Deployment of dev/prod environments (docker/baremetal)
  * Generation and validation of configs (.env, docker-compose)
  * Management of migrations, backup/restore, logs, healthcheck
  * Interactive service monitoring (TUI)
  * Administration of storage/postgres-meta through internal API
  * Extensibility: plugins, custom commands

### 2. **Backend API Server (apps/admin-api)**

* **Implementation:** TypeScript/Node.js (Express/NestJS/Fastify)
* **Tasks:**

  * Central point for integrations and access logic
  * Proxy for operations with Supabase Storage and postgres-meta
  * Routing, ACL, authorization, audit
  * REST/GraphQL API for Dashboard and automation
  * Extensible layer for business logic, security, and integrations

### 3. **Dashboard Panel (apps/dashboard)**

* **Implementation:** React, MUI (Material UI), Vite/Next.js
* **Tasks:**

  * Web interface for admins: bucket creation, files, ACL and policy management
  * Visualization of service status, logs, monitoring
  * Interactive RLS/user role management
  * Integration with backend API
  * Support for custom views and extensions

### 4. **Supabase Storage**

* **Deployment:** Docker container or baremetal
* **Tasks:**

  * Physical storage of bucket/object
  * RLS and ACL at Postgres level
  * Support for production optimizations (functions, indexes, scalability)

### 5. **Postgres-meta**

* **Deployment:** Docker container
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

## Scalability and Security

* **All services are deployed and scaled through CLI** (docker-compose/swarm/k8s/baremetal).
* **Backend API** and Dashboard have strict authorization, all actions are logged (audit).
* **Storage of secrets and configs** — only in secured .env/secrets/vault, automated by CLI.
* **Horizontal scaling** for Storage and postgres-meta (Docker Swarm, K8s, LB), preparation for multi-region.

---

## Brief Summary

The **supastorj** project is a scalable, modular, and secure self-hosted platform for working with Supabase Storage object storage, where all infrastructure and management are reduced to convenient CLI, web, and API tools.
