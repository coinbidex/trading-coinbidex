#!/bin/bash
# Manual DB backup script — also runs automatically via cron daily at 2am
# (see deploy/vps-setup.sh for the cron entry).
# Usage: bash deploy/backup.sh
set -e

BASE_DIR="/var/www/coinbidex"
BACKUP_DIR="$BASE_DIR/backups"
DATE=$(date +%Y%m%d_%H%M%S)
MAX_DAYS=7

mkdir -p "$BACKUP_DIR/live" "$BACKUP_DIR/staging"
echo "[$(date)] Starting backup..."

# Live DB
cd "$BASE_DIR/trading-coinbidex"
docker compose -f docker-compose.prod.yml --env-file .env.live exec -T postgres-live \
  pg_dump -U cb_live cb_live_db | gzip > "$BACKUP_DIR/live/live_${DATE}.sql.gz" && \
  echo "[$(date)] ✅ Live DB backed up: live_${DATE}.sql.gz" || \
  echo "[$(date)] ❌ Live DB backup FAILED"

# Staging DB
cd "$BASE_DIR/staging-trading-coinbidex"
docker compose -f docker-compose.staging.yml --env-file .env.staging exec -T postgres-staging \
  pg_dump -U cb_staging cb_staging_db | gzip > "$BACKUP_DIR/staging/staging_${DATE}.sql.gz" && \
  echo "[$(date)] ✅ Staging DB backed up: staging_${DATE}.sql.gz" || \
  echo "[$(date)] ❌ Staging DB backup FAILED"

# Cleanup old backups
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$MAX_DAYS -delete
echo "[$(date)] Cleaned up backups older than ${MAX_DAYS} days"

echo "[$(date)] Current backups:"
ls -lh "$BACKUP_DIR"/live/*.sql.gz "$BACKUP_DIR"/staging/*.sql.gz 2>/dev/null || echo "  (none)"
