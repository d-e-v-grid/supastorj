# Supastorj Storage API Deployment

## Configuration
Configuration is stored in `.env`

## Quick Start

### Using Docker
```bash
# Start the storage API
./start-storage.sh

# Stop the storage API
./stop-storage.sh

# View logs
docker logs -f storage-api
```

### Using systemd (recommended for Debian/Ubuntu)
```bash
# Copy service file
sudo cp supastorj.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable auto-start
sudo systemctl enable supastorj

# Start service
sudo systemctl start supastorj

# Check status
sudo systemctl status supastorj

# View logs
sudo journalctl -u supastorj -f
```

## API Endpoints
- Health check: http://{{serverHost}}:{{serverPort}}/health
- Storage API: http://{{serverHost}}:{{serverPort}}/

## Security Notes
- Keep `.env` secure (mode 600)
- Generated keys:
  - JWT Secret: {{jwtSecretPreview}}...
  - Anon Key: {{anonKeyPreview}}...
  - Service Key: {{serviceKeyPreview}}...

## Troubleshooting
- Check logs: `tail -f logs/storage-api.log`
- Verify connectivity to PostgreSQL
- Ensure S3/storage backend is accessible
- Check firewall rules for port {{serverPort}}