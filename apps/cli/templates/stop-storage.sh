#!/bin/bash
# Supastorj Storage API Shutdown Script

set -e

# Load environment variables
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

# Check if using Docker or direct execution
if [ "${USE_DOCKER}" = "true" ]; then
    echo "Stopping Storage API Docker container..."
    
    docker stop storage-api 2>/dev/null || echo "Container not running"
    docker rm storage-api 2>/dev/null || echo "Container not found"
    
    echo "Storage API stopped"
else
    echo "Stopping Storage API process..."
    
    if [ -f storage-api.pid ]; then
        PID=$(cat storage-api.pid)
        if kill -0 $PID 2>/dev/null; then
            kill $PID
            echo "Storage API stopped (PID: $PID)"
        else
            echo "Storage API not running (stale PID file)"
        fi
        rm storage-api.pid
    else
        echo "No PID file found. Storage API may not be running."
    fi
fi