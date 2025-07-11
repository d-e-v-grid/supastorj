#!/bin/bash
# Supastorj Unified Startup Script
# Supports both development (Docker Compose) and production modes

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if project is initialized
if [ ! -f "supastorj.config.yaml" ]; then
    log_error "Project not initialized. Run 'supastorj init' first."
    exit 1
fi

# Load environment variables if .env exists
if [ -f .env ]; then
    set -a
    source .env
    set +a
else
    log_error ".env file not found! Run 'supastorj init' first."
    exit 1
fi

# Detect deployment mode from project.json if exists
DEPLOYMENT_MODE="development"
if [ -f ".supastorj/project.json" ]; then
    MODE=$(grep -o '"mode"[[:space:]]*:[[:space:]]*"[^"]*"' .supastorj/project.json | sed 's/.*:\s*"\([^"]*\)".*/\1/')
    if [ -n "$MODE" ]; then
        DEPLOYMENT_MODE="$MODE"
    fi
fi

# Override with command line argument if provided
if [ -n "$1" ]; then
    case "$1" in
        --dev|--development)
            DEPLOYMENT_MODE="development"
            ;;
        --prod|--production)
            DEPLOYMENT_MODE="production"
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --dev, --development    Start in development mode (Docker Compose)"
            echo "  --prod, --production    Start in production mode"
            echo "  --attach, -a            Run in foreground (attached mode)"
            echo "  --help, -h              Show this help message"
            exit 0
            ;;
    esac
fi

# Check for attach mode
ATTACH_MODE=false
for arg in "$@"; do
    if [ "$arg" = "--attach" ] || [ "$arg" = "-a" ]; then
        ATTACH_MODE=true
        break
    fi
done

log_info "Starting Supastorj in ${DEPLOYMENT_MODE} mode..."

# Development mode - Use Docker Compose
if [ "$DEPLOYMENT_MODE" = "development" ] || [ "$DEPLOYMENT_MODE" = "staging" ]; then
    
    # Check if docker-compose.yml exists
    if [ ! -f "docker-compose.yml" ]; then
        log_error "docker-compose.yml not found!"
        exit 1
    fi
    
    # Detect Docker Compose command
    if docker compose version >/dev/null 2>&1; then
        DOCKER_COMPOSE="docker compose"
    elif docker-compose version >/dev/null 2>&1; then
        DOCKER_COMPOSE="docker-compose"
    else
        log_error "Docker Compose is not installed!"
        log_info "Please install Docker Compose: https://docs.docker.com/compose/install/"
        exit 1
    fi
    
    # Get project name from config or use default
    PROJECT_NAME="${PROJECT_NAME:-supastorj}"
    
    # Build docker-compose command
    COMPOSE_CMD="$DOCKER_COMPOSE -f docker-compose.yml -p $PROJECT_NAME"
    
    # Check storage backend and add appropriate profiles
    PROFILES=""
    if [ "${STORAGE_BACKEND}" = "s3" ]; then
        PROFILES="--profile s3"
        log_info "Using S3 storage backend with MinIO"
    fi
    
    if [ "${IMAGE_TRANSFORMATION_ENABLED}" = "true" ]; then
        PROFILES="$PROFILES --profile imgproxy"
        log_info "Image transformation enabled with imgproxy"
    fi
    
    # Start services
    if [ "$ATTACH_MODE" = true ]; then
        log_info "Starting services in attached mode (press Ctrl+C to stop)..."
        $COMPOSE_CMD $PROFILES up
    else
        log_info "Starting services in detached mode..."
        $COMPOSE_CMD $PROFILES up -d
        
        # Wait for services to be healthy
        log_info "Waiting for services to be healthy..."
        sleep 5
        
        # Show service status
        log_info "Service status:"
        $COMPOSE_CMD ps
        
        log_info "All services started successfully!"
        log_info "Run 'supastorj status' to check service status"
        log_info "Run 'supastorj logs -f' to see service logs"
    fi
    
# Production mode
elif [ "$DEPLOYMENT_MODE" = "production" ]; then
    
    # Create logs directory if it doesn't exist
    mkdir -p logs
    
    # Check if using Docker or direct execution
    if [ "${USE_DOCKER}" = "true" ]; then
        log_info "Starting Storage API with Docker..."
        
        # Check if Docker is installed
        if ! command -v docker &> /dev/null; then
            log_error "Docker is not installed!"
            exit 1
        fi
        
        # Pull latest image if needed
        docker pull supabase/storage-api:v1.13.1
        
        # Stop existing container if running
        docker stop storage-api 2>/dev/null || true
        docker rm storage-api 2>/dev/null || true
        
        # Run container
        if [ "$ATTACH_MODE" = true ]; then
            log_info "Starting Storage API in attached mode (press Ctrl+C to stop)..."
            docker run --rm \
                --name storage-api \
                -p ${SERVER_PORT:-5000}:5000 \
                --env-file .env \
                -v $(pwd)/logs:/app/logs \
                -v $(pwd)/data/storage:/var/lib/storage \
                supabase/storage-api:v1.13.1
        else
            docker run -d \
                --name storage-api \
                --restart unless-stopped \
                -p ${SERVER_PORT:-5000}:5000 \
                --env-file .env \
                -v $(pwd)/logs:/app/logs \
                -v $(pwd)/data/storage:/var/lib/storage \
                supabase/storage-api:v1.13.1
            
            log_info "Storage API started on port ${SERVER_PORT:-5000}"
            log_info "View logs: docker logs -f storage-api"
        fi
    else
        log_info "Starting Storage API from source..."
        
        # Check if storage directory exists
        if [ ! -d "./storage" ]; then
            log_error "./storage directory not found!"
            log_error "Run 'supastorj init prod' with source build option first."
            exit 1
        fi
        
        cd storage
        
        # Check if built
        if [ ! -d "dist" ] || [ ! -f "dist/start/server.js" ]; then
            log_error "Storage server not built!"
            log_error "Run 'npm run build:main' in the storage directory."
            exit 1
        fi
        
        # Run migrations
        log_info "Running database migrations..."
        npm run db:migrate || log_warning "Migration may have already been applied"
        
        # Start the server
        if [ "$ATTACH_MODE" = true ]; then
            log_info "Starting server in attached mode (press Ctrl+C to stop)..."
            log_info "Server: http://${SERVER_HOST:-0.0.0.0}:${SERVER_PORT:-5000}"
            node dist/start/server.js
        else
            log_info "Starting server in background..."
            nohup node dist/start/server.js > ../logs/storage-api.log 2>&1 &
            echo $! > ../storage-api.pid
            
            log_info "Storage API started!"
            log_info "Server: http://${SERVER_HOST:-0.0.0.0}:${SERVER_PORT:-5000}"
            log_info "PID: $(cat ../storage-api.pid)"
            log_info "View logs: tail -f logs/storage-api.log"
        fi
    fi
    
else
    log_error "Unknown deployment mode: $DEPLOYMENT_MODE"
    exit 1
fi