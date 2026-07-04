#!/bin/bash
# Manual DB backup script
# Also runs automatically via cron daily at 2am
# Usage: bash deploy/backup.sh

APP_DIR="/var/www/coinbidex"
BACKUP_DIR="$APP_DIR/backups"
DATE=$(date +%Y%m%d_%H%M%S)
MAX_DAYS=7

cd "$APP_DIR"
source .env.live 2>/dev/null || true

echo "[$(date)] Starting backup..."

# Live DB
docker compose -f docker-compose.prod.yml --env-file .env.live exec -T postgres-live \
  pg_dump -U cb_live cb_live_db | gzip > "$BACKUP_DIR/live_${DATE}.sql.gz" && \
  echo "[$(date)] ✅ Live DB backed up: live_${DATE}.sql.gz" || \
  echo "[$(date)] ❌ Live DB backup FAILED"

# Demo DB
docker compose -f docker-compose.demo.yml exec -T postgres-demo \
  pg_dump -U cb_demo cb_demo_db | gzip > "$BACKUP_DIR/demo_${DATE}.sql.gz" && \
  echo "[$(date)] ✅ Demo DB backed up: demo_${DATE}.sql.gz" || \
  echo "[$(date)] ❌ Demo DB backup FAILED"

# Cleanup old backups
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$MAX_DAYS -delete
echo "[$(date)] Cleaned up backups older than ${MAX_DAYS} days"

# Show current backups
echo "[$(date)] Current backups:"
ls -lh "$BACKUP_DIR"/*.sql.gz 2>/dev/null || echo "  (none)"
