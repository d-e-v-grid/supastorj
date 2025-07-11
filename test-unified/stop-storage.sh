#!/bin/bash
# Supastorj Unified Shutdown Script
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

# Load environment variables if .env exists
if [ -f .env ]; then
    set -a
    source .env
    set +a
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
            echo "  --dev, --development    Stop development mode services"
            echo "  --prod, --production    Stop production mode services"
            echo "  --help, -h              Show this help message"
            exit 0
            ;;
    esac
fi

log_info "Stopping Supastorj services in ${DEPLOYMENT_MODE} mode..."

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
        exit 1
    fi
    
    # Get project name from config or use default
    PROJECT_NAME="${PROJECT_NAME:-supastorj}"
    
    # Stop all services
    log_info "Stopping Docker Compose services..."
    $DOCKER_COMPOSE -f docker-compose.yml -p $PROJECT_NAME down
    
    log_info "All services stopped successfully!"
    
# Production mode
elif [ "$DEPLOYMENT_MODE" = "production" ]; then
    
    # Check if using Docker or direct execution
    if [ "${USE_DOCKER}" = "true" ]; then
        log_info "Stopping Storage API Docker container..."
        
        # Check if container exists
        if docker ps -a --format '{{.Names}}' | grep -q '^storage-api$'; then
            docker stop storage-api 2>/dev/null && log_info "Container stopped" || log_warning "Container was not running"
            docker rm storage-api 2>/dev/null && log_info "Container removed" || log_warning "Failed to remove container"
        else
            log_warning "Container 'storage-api' not found"
        fi
        
        log_info "Storage API stopped"
    else
        log_info "Stopping Storage API process..."
        
        if [ -f storage-api.pid ]; then
            PID=$(cat storage-api.pid)
            if kill -0 $PID 2>/dev/null; then
                kill $PID
                log_info "Storage API stopped (PID: $PID)"
                
                # Wait for process to stop
                COUNT=0
                while kill -0 $PID 2>/dev/null && [ $COUNT -lt 10 ]; do
                    sleep 1
                    COUNT=$((COUNT + 1))
                done
                
                # Force kill if still running
                if kill -0 $PID 2>/dev/null; then
                    log_warning "Process did not stop gracefully, force killing..."
                    kill -9 $PID 2>/dev/null || true
                fi
            else
                log_warning "Storage API not running (stale PID file)"
            fi
            rm -f storage-api.pid
        else
            log_warning "No PID file found. Storage API may not be running."
            
            # Try to find and stop node process
            NODE_PID=$(pgrep -f "node.*storage.*server.js" || true)
            if [ -n "$NODE_PID" ]; then
                log_info "Found storage process (PID: $NODE_PID), stopping..."
                kill $NODE_PID 2>/dev/null || true
            fi
        fi
        
        log_info "Storage API stopped"
    fi
    
else
    log_error "Unknown deployment mode: $DEPLOYMENT_MODE"
    exit 1
fi