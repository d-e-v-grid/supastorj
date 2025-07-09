# Technical Specification

### **supastorj: CLI & TUI framework for DevOps and admin operations with supabase/storage and postgres-meta**

---

This CLI utility should be created in the `apps/cli` folder with the name `@supastorj/cli`.

## 1. **General Purpose and Requirements**

### 1.1 Purpose

* Single CLI/TUI utility for automating startup, monitoring, management, and administration of Supabase Storage and postgres-meta servers (dev/prod, docker/baremetal).
* Quick onboarding and DevOps tool: all infrastructure and operations are managed through a single point.
* Support for scenarios: local development, production deployment, migrations, monitoring, backup/restore, extended admin commands.
* Visual TUI interface (Ink) for interactive management and monitoring.

### 1.2 Functional Requirements

* Start/stop all services in dev/prod (docker/docker-compose, baremetal).
* Config management: generation, validation, updating (docker-compose.yml, .env, etc.).
* Service status monitoring (status, healthcheck, logs).
* Migration management and schema initialization (storage schema, custom functions).
* Backup/restore data (Postgres dumps, Storage objects).
* Security policy management, roles, RLS (via postgres-meta API).
* Bucket/object operations: CRUD operations, listing, access (like storage-js, via REST).
* Built-in TUI dashboards for visual control.
* Extensibility for custom commands (plugins/hooks).
* Cross-platform support (Linux/macOS/WSL, Windows support via WSL2).

### 1.3 Non-Functional Requirements

* Language: TypeScript (Node.js ≥ 18).
* CLI/TUI based on [Ink](https://github.com/vadimdemedes/ink).
* Correct operation via npm/yarn/pnpm, support for single-binary bundle (pkg/esbuild).
* Strict code structure (ESM, eslint, TS strict).
* Unit tests for all key components.
* Documented command API (automatic help/man generation).
* Extensibility: support for external modules/plugins.
* Audit log maintenance for all operations.

---

## 2. **Architecture and Components**

### 2.1 Architectural Layers

* **Core CLI:** command processing, global state, config parsing, routing.
* **Service Adapters:** abstractions for docker/docker-compose, shell, http-api (storage, postgres-meta), Postgres.
* **TUI Layer (Ink):** visual components and interfaces (status board, process manager, migrations, log manager).
* **Config Engine:** generation, validation, migration, and synchronization of all .env, docker-compose, secrets, etc.
* **Command Modules:** individual commands (up, down, migrate, logs, admin, meta, backup, restore, shell).
* **Plugin System:** system for connecting custom/3rd party modules.
* **Test & Audit Layer:** integration and unit tests, audit-trail.

---

### 2.2 Key External Dependencies

* **ink** (CLI-TUI): React-like components for terminal.
* **commander** or [@clack/prompts](https://github.com/natemoo-re/clack): command/option parsing.
* **dockerode**: Docker/Docker Compose operations via Node.
* **axios/got**: HTTP client for REST requests (storage, postgres-meta).
* **execa**: asynchronous shell commands.
* **dotenv**: parsing and generation of .env.
* **yaml**: work with docker-compose.yml and other yaml configs.
* **ora/ink-spinner**: loading animations and progress.
* **winston/pino**: structured logging and audit.

---

### 2.3 Example Architectural Diagram (high-level)

```
[ Terminal User ]
      │
      ▼
 [ Ink-based CLI (supastorj) ]
      │
  ┌────┴───────────────┐
  │  ServiceAdapters   │ (docker, storage, pg-meta, shell)
  ├────────────────────┤
  │    ConfigEngine    │ (compose, env, templates)
  ├────────────────────┤
  │   TUI Components   │ (status, logs, board)
  ├────────────────────┤
  │ Command/Plugin API │ (core + external)
  └────────────────────┘
```

---

## 3. **Commands and Scenarios (MVP + roadmap)**

### 3.1 Main Commands (descriptions)

* `supastorj init` — project initialization, generation of docker-compose templates, .env, storage-schema.
* `supastorj up [--dev|--prod]` — start all services.
* `supastorj down` — stop and remove services/volumes.
* `supastorj status` — TUI status board: services, health, ports, uptime, version.
* `supastorj logs [service] [--follow]` — service logs with TUI component.
* `supastorj migrate` — run storage schema migrations, custom functions.
* `supastorj shell [service]` — open shell inside container or psql.
* `supastorj backup|restore [--target]` — backup/restore database and/or objects.
* `supastorj admin` — launch dashboard panel (if available).
* `supastorj meta [api/endpoint] [params]` — access to postgres-meta API.
* `supastorj bucket <cmd>` — CRUD/listing buckets via storage API.
* `supastorj object <cmd>` — CRUD/listing objects via storage API.
* `supastorj policy <cmd>` — policy and RLS management via meta API.

### 3.2 Advanced Commands (roadmap)

* `supastorj monitor` — separate TUI monitor: load, metrics, alerts, healthcheck.
* `supastorj update` — auto-update images and schemas.
* `supastorj secrets` — secrets/credentials management (vault/integrations).
* `supastorj plugin <cmd>` — plugin/ext-module management.
* `supastorj test` — automatic self-test and healthcheck of all components.
* `supastorj ci` — commands for CI/CD integration.

---

## 4. **Project Structure (files/directories)**

```
/supastorj
  /src
    /cli           # Entry point and routing
    /ink           # TUI components
    /adapters      # Work with docker, storage, meta, shell
    /commands      # Command implementation (up, down, migrate, backup, meta, etc.)
    /config        # Work with env, yaml, secrets
    /utils         # Helper functions
    /plugins       # Extension system
    /tests         # Tests
  /templates       # docker-compose.yml, .env.example, etc.
  /docs            # Documentation
  package.json
  tsconfig.json
  README.md
```

---

## 5. **TUI Requirements (Ink Components)**

* **Main Dashboard (status):**

  * Displays status of all services: running/healthy, ports, uptime, version, error logs.
  * Service management (restart, stop, shell).
* **Log Components:**

  * tail/follow, filters by service, scrolling.
* **Migrations:**

  * Progress bar, status of each migration, error list.
* **Monitoring:**

  * CPU/mem/docker stats, upload/download speed, Postgres metrics, alerts.
* **Prompts and Confirmations:**

  * Use [@clack/prompts](https://github.com/natemoo-re/clack) or custom ink-prompts.
* **Color Scheme:**

  * Light/dark, customization via config/ENV.
* **UX:**

  * Quick hotkeys (q — quit, r — restart, l — logs, s — status, etc.), smooth transitions.

---

## 6. **Security and Secret Management**

* .env and secrets are NOT committed, .env.example template is generated automatically.
* All dangerous actions require confirmation in TUI.
* Integration with vault/secrets (roadmap).
* Admin action logs are maintained (audit trail).

---

## 7. **Extensibility**

* Command and TUI architecture — via plugins (modules with auto-registration, documentation, types).
* Ability to add custom commands and external integrations without breaking core.
* Hook system for pre/post events (e.g. "after migration — run test").

---

## 8. **Tests and Documentation**

* Minimum 80% code coverage with unit tests (Jest/Vitest, ink-testing-library).
* Integration tests (docker-compose, e2e).
* Automatic generation of man/help for all commands.
* Detailed README, code docs, command examples.

---

## 9. **Dev Experience**

* Quick start: `npx supastorj init && supastorj up`
* Watch mode/dev reload for Ink components.
* Automatic version check for docker/docker-compose/Node.
* Optional single-binary bundle (pkg, nexe, esbuild) for distribution.

---

## 10. **Roadmap & Perspectives**

* WebUI companion (dashboard on Next.js/Solid) using the same core API.
* Integration with cloud registries, monitoring, alerting.
* Export to Kubernetes/Swarm (manifest generation).

---

# TL;DR: READY SOLUTION CRITERIA

* **CLI in TypeScript** with a powerful TUI interface (Ink), structurally divided into 
core/commands/adapters/config/plugins.
* **Covers the entire dev/prod stack:** launch, monitoring, migrations, backup, 
secure management.
* **Easily extensible**, covered by tests, documentation, ready for team and CI.
* **User-friendly UX/interactivity, minimal entry threshold**.

---

# 1. DEV/PROD DEPLOYMENT SCENARIOS

## 1.1. Key Requirements

* All deployment must be automated via CLI (`supastorj up 
--dev` / `--prod`), with full environment generation (.env, docker-compose.yml, 
storage schema, initial users, roles, RLS).
* **DEV** — maximum simplicity, single server/node, minimal manual actions.
* **PROD** — support for scaling (horizontal for storage/
postgres-meta), secure secret generation, security best practices, 
ability to deploy to a cluster.
* **BAREMETAL** — bootstrap via apt, auto-setup of systemd/services.
* All actions are logged and controlled (audit log).
* Configs and environment variables are automatically validated.

---