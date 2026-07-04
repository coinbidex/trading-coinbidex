-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- TimescaleDB for time-series data (optional, skip if not available)
-- CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
