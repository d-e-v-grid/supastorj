-- Create extensions needed for Supabase Storage
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Ensure proper permissions for the storage database
GRANT ALL PRIVILEGES ON DATABASE storage TO postgres;

-- Create schema if not exists
CREATE SCHEMA IF NOT EXISTS storage;
GRANT ALL ON SCHEMA storage TO postgres;

-- Alter authentication to allow connections from Docker network
ALTER SYSTEM SET listen_addresses = '*';

-- Log connections for debugging
ALTER SYSTEM SET log_connections = 'on';
ALTER SYSTEM SET log_disconnections = 'on';
ALTER SYSTEM SET log_duration = 'on';

-- Reload configuration
SELECT pg_reload_conf();