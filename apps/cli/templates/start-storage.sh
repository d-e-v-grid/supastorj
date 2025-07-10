#!/bin/bash
# Supastorj Storage API Startup Script

set -e

# Load environment variables
if [ ! -f .env ]; then
    echo "Error: .env file not found!"
    exit 1
fi

# Export all variables from .env
set -a
source .env
set +a

# Check if using Docker or direct execution
if [ "${USE_DOCKER}" = "true" ]; then
    echo "Starting Storage API with Docker..."
    
    # Pull latest image if needed
    docker pull supabase/storage-api:v1.13.1
    
    # Stop existing container if running
    docker stop storage-api 2>/dev/null || true
    docker rm storage-api 2>/dev/null || true
    
    # Run container
    docker run -d \
        --name storage-api \
        --restart unless-stopped \
        -p ${SERVER_PORT}:5000 \
        --env-file .env \
        -v $(pwd)/logs:/app/logs \
        -v $(pwd)/data/storage:/var/lib/storage \
        supabase/storage-api:v1.13.1
    
    echo "Storage API started on port ${SERVER_PORT}"
    echo "View logs: docker logs -f storage-api"
else
    echo "Starting Storage API from source..."
    
    # Check if storage directory exists
    if [ ! -d "./storage" ]; then
        echo "Error: ./storage directory not found!"
        echo "Run 'supastorj init --mode prod' with source build option first."
        exit 1
    fi
    
    cd storage
    
    # Run migrations
    echo "Running database migrations..."
    npm run db:migrate || true
    
    # Start the server
    echo "Starting server..."
    nohup npm start > ../logs/storage-api.log 2>&1 &
    echo $! > ../storage-api.pid
    
    echo "Storage API started on port ${SERVER_PORT}"
    echo "PID: $(cat ../storage-api.pid)"
    echo "View logs: tail -f logs/storage-api.log"
fi