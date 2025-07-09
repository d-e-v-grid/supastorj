# Supastorj Architecture Documentation

## Overview

Supastorj is a modern DevOps platform for autonomous and flexible management of object storage based on Supabase Storage and Postgres. The system is designed for self-hosted and enterprise deployments, combining a powerful CLI, convenient admin panel, and API server in a unified architecture.

## Core Principles

1. **Modularity**: Each component is independently deployable and scalable
2. **Extensibility**: Plugin-based architecture for custom functionality
3. **Security First**: Built-in security patterns and audit logging
4. **Developer Experience**: Simple onboarding and intuitive interfaces
5. **Production Ready**: Support for scaling, monitoring, and high availability

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              User Layer                                 │
├────────────────┬────────────────────┬───────────────────────────────────┤
│                │                    │                                   │
│  CLI/TUI       │    Dashboard       │        External APIs              │
│  (Ink/React)   │    (React/MUI)     │        (REST/GraphQL)             │
│                │                    │                                   │
└────────┬───────┴──────────┬─────────┴───────────────┬───────────────────┘
         │                  │                         │
         ▼                  ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Application Layer                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐   │
│  │   Command   │  │   Event      │  │   Plugin     │  │   Config    │   │
│  │   Router    │  │   Bus        │  │   Manager    │  │   Engine    │   │
│  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘   │
│         │                │                  │                  │        │
│         ▼                ▼                  ▼                  ▼        │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │                     Core Services Layer                        │     │
│  ├────────────────────────────────────────────────────────────────┤     │
│  │  • Authentication  • Authorization  • Audit Logging            │     │
│  │  • Health Checks   • Metrics       • Error Handling            │     │
│  └────────────────────────────────────────────────────────────────┘     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
         │                  │                         │
         ▼                  ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Integration Layer                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐   │
│  │   Docker    │  │   Storage    │  │  Postgres    │  │   Shell     │   │
│  │   Adapter   │  │   API Client │  │  Meta Client │  │   Executor  │   │
│  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘   │
│         │                │                  │                  │        │
└─────────┼────────────────┼──────────────────┼──────────────────┼────────┘
          │                │                  │                  │
          ▼                ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Infrastructure Layer                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐   │
│  │   Docker/   │  │   Supabase   │  │   Postgres   │  │   System    │   │
│  │   Compose   │  │   Storage    │  │   Meta API   │  │   Services  │   │
│  └─────────────┘  └──────────────┘  └──────────────┘  └─────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. CLI/TUI (apps/cli)

The command-line interface is the primary interaction point for DevOps operations.

**Key Features:**
- Interactive TUI using Ink (React for terminal)
- Command-based interface with rich autocompletion
- Real-time monitoring and status dashboards
- Plugin system for custom commands
- Multi-environment support (dev/staging/prod)

**Technology Stack:**
- TypeScript with strict mode
- Ink for TUI components
- Commander.js for command parsing
- Zod for schema validation

### 2. Backend API (apps/admin-api)

Central API server providing business logic and integration layer.

**Key Features:**
- RESTful and GraphQL endpoints
- Authentication and authorization
- Audit logging for all operations
- Rate limiting and security middleware
- WebSocket support for real-time updates

**Technology Stack:**
- Node.js with TypeScript
- Fastify for high performance
- GraphQL with Apollo Server
- Prisma for database operations

### 3. Dashboard (apps/dashboard)

Web-based administrative interface for visual management.

**Key Features:**
- Real-time service monitoring
- Bucket and object management
- User and permission management
- Log viewing and filtering
- Custom dashboard widgets

**Technology Stack:**
- React 18 with TypeScript
- Material-UI for components
- React Query for data fetching
- Recharts for data visualization

### 4. Service Adapters

Abstraction layer for external service integration.

**Docker Adapter:**
- Container lifecycle management
- Docker Compose orchestration
- Health check monitoring
- Log streaming

**Storage API Client:**
- Bucket CRUD operations
- Object upload/download
- Policy management
- Signed URL generation

**Postgres Meta Client:**
- Schema management
- RLS policy configuration
- Role and permission management
- Database introspection

### 5. Plugin System

Extensible architecture for custom functionality.

**Plugin Types:**
- Command plugins (new CLI commands)
- Service plugins (new adapters)
- UI plugins (dashboard widgets)
- Hook plugins (lifecycle events)

**Plugin API:**
```typescript
interface Plugin {
  name: string;
  version: string;
  type: PluginType;
  init(context: PluginContext): Promise<void>;
  destroy?(): Promise<void>;
}
```

### 6. Event System

Decoupled communication between components.

**Event Types:**
- Service lifecycle events
- Configuration changes
- Error and warning events
- Audit events
- Custom plugin events

**Event Bus:**
```typescript
interface EventBus {
  emit<T>(event: string, data: T): void;
  on<T>(event: string, handler: (data: T) => void): void;
  off(event: string, handler: Function): void;
}
```

### 7. Configuration Management

Hierarchical configuration with environment-specific overrides.

**Configuration Sources:**
1. Default configuration
2. Environment files (.env)
3. YAML configuration files
4. Environment variables
5. Command-line arguments

**Configuration Schema:**
```yaml
# supastor.config.yaml
version: "1.0"
environments:
  default:
    postgres:
      host: localhost
      port: 5432
    storage:
      endpoint: http://localhost:5000
  production:
    extends: default
    postgres:
      host: ${POSTGRES_HOST}
      ssl: true
```

## Security Architecture

### Authentication & Authorization

- JWT-based authentication
- Role-based access control (RBAC)
- API key management
- Session management with refresh tokens

### Audit Logging

All operations are logged with:
- User/service identity
- Operation type and parameters
- Timestamp and duration
- Success/failure status
- IP address and user agent

### Secret Management

- Environment variable encryption
- Integration with HashiCorp Vault
- Automatic secret rotation
- Secure secret generation

## Deployment Patterns

### Development Environment

```bash
supastor init --dev
supastor up --dev
```

- Single-node deployment
- Hot reloading enabled
- Debug logging
- Mock services available

### Production Environment

```bash
supastor init --prod
supastor up --prod --scale storage=3 --scale meta=2
```

- Multi-node deployment
- Load balancing
- Health checks and auto-recovery
- Monitoring and alerting

### Bare Metal Deployment

```bash
supastor bootstrap --baremetal
supastor deploy --target=production
```

- System dependency installation
- Systemd service configuration
- Firewall rules setup
- SSL certificate management

## Monitoring & Observability

### Metrics Collection

- Prometheus-compatible metrics
- Custom business metrics
- Performance counters
- Resource utilization

### Health Checks

- Service availability
- Database connectivity
- Storage accessibility
- API response times

### Logging

- Structured JSON logging
- Log aggregation support
- Error tracking integration
- Distributed tracing

## Performance Considerations

### Optimization Strategies

1. **Connection Pooling**: Reuse database and HTTP connections
2. **Caching**: Redis-based caching for frequently accessed data
3. **Lazy Loading**: Load components only when needed
4. **Batch Operations**: Group similar operations for efficiency
5. **Async Processing**: Use worker queues for heavy operations

### Scalability

- Horizontal scaling for stateless services
- Database read replicas
- CDN integration for static assets
- Queue-based job processing

## Development Workflow

### Local Development

```bash
# Install dependencies
yarn install

# Start development servers
yarn dev

# Run tests
yarn test

# Build for production
yarn build
```

### Testing Strategy

- Unit tests for business logic
- Integration tests for API endpoints
- E2E tests for critical workflows
- Performance benchmarks
- Security audits

### CI/CD Pipeline

1. Code quality checks (ESLint, Prettier)
2. Type checking (TypeScript)
3. Unit and integration tests
4. Security vulnerability scanning
5. Docker image building
6. Deployment to staging
7. Smoke tests
8. Production deployment

## Future Enhancements

### Short Term (v1.x)

- Kubernetes operator
- Multi-region support
- Advanced monitoring dashboards
- Backup automation
- Migration tools

### Long Term (v2.x)

- Multi-cloud support
- AI-powered optimization
- Advanced analytics
- Marketplace for plugins
- Enterprise features (SSO, compliance)

## Conclusion

Supastorj's architecture is designed to be modular, scalable, and secure while maintaining simplicity for developers and operators. The plugin system ensures extensibility, while the event-driven architecture enables loose coupling between components. This design supports both small deployments and large-scale enterprise installations.