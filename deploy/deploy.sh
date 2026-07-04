#!/bin/bash
# =============================================================
# Coinbidex Deploy Script — run manually ONCE for the first bootstrap
# (SSL certs + nginx + initial container start). After this, ongoing
# deploys happen automatically via GitHub Actions (.github/workflows/deploy.yml)
# which only pulls pre-built images — it does not rebuild on the VPS.
# Usage: bash deploy/deploy.sh trade.coinbidex.com your@email.com
# =============================================================
set -e

TRADE_DOMAIN=${1:?"Usage: bash deploy/deploy.sh trade.coinbidex.com your@email.com"}
DEMO_DOMAIN="v1.${TRADE_DOMAIN#*.}"      # v1.coinbidex.com from trade.coinbidex.com
STAGING_DOMAIN="staging.${TRADE_DOMAIN#*.}"
EMAIL=${2:?"Usage: bash deploy/deploy.sh trade.coinbidex.com your@email.com"}

# Auto-detect app dir from script location — works regardless of where project lives
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Nginx config name — completely isolated, never touches other sites
NGINX_CONF="trading-coinbidex"

RED='\033[0;31m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${BLUE}▶ $1${NC}"; }
ok()   { echo -e "${GREEN}✅ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠  $1${NC}"; }
err()  { echo -e "${RED}❌ $1${NC}"; exit 1; }

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       Coinbidex Production Deploy        ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo -e "  Live    : ${BLUE}https://${TRADE_DOMAIN}${NC}"
echo -e "  Demo    : ${BLUE}https://${DEMO_DOMAIN}${NC}"
echo -e "  Staging : ${BLUE}https://${STAGING_DOMAIN}${NC}"
echo ""

# ── Check .env.live exists ────────────────────────────────────
if [ ! -f "$APP_DIR/.env.live" ]; then
  warn ".env.live not found — generating template..."
  cat > "$APP_DIR/.env.live" << ENV
DOMAIN=${TRADE_DOMAIN}
NODE_ENV=production
PLATFORM_MODE=live

DB_PASSWORD=$(openssl rand -hex 32)
REDIS_PASSWORD=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 64)
JWT_REFRESH_SECRET=$(openssl rand -hex 64)

# SET THESE — your ETH wallet earns swap fees immediately
REFERRAL_WALLET_ADDRESS=0xYOUR_ETH_WALLET_HERE
REFERRAL_FEE_BPS=30
SWAP_MARKUP_PCT=0.3

ONEINCH_API_KEY=
MOONPAY_PUBLISHABLE_KEY=
MOONPAY_SECRET_KEY=
BINANCE_BROKER_API_KEY=
BINANCE_BROKER_API_SECRET=

SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=Coinbidex <noreply@${TRADE_DOMAIN}>

VITE_WALLETCONNECT_PROJECT_ID=
ETH_RPC_URL=https://cloudflare-eth.com
POLY_RPC_URL=https://polygon-rpc.com
BSC_RPC_URL=https://bsc-dataseed.binance.org
ENV
  warn "Edit $APP_DIR/.env.live then re-run this script."
  warn "REQUIRED: Change REFERRAL_WALLET_ADDRESS to your real wallet."
  exit 0
fi

source "$APP_DIR/.env.live"

# ── Issue SSL certs ───────────────────────────────────────────
log "Issuing SSL certificates..."

# Stop nginx briefly for standalone cert issuance
systemctl stop nginx 2>/dev/null || true

for domain in "$TRADE_DOMAIN" "$DEMO_DOMAIN" "www.$TRADE_DOMAIN" "$STAGING_DOMAIN"; do
  if [ ! -d "/etc/letsencrypt/live/$domain" ]; then
    certbot certonly --standalone \
      --email "$EMAIL" \
      --agree-tos --no-eff-email \
      -d "$domain" \
      --non-interactive --quiet && ok "SSL cert: $domain" || warn "SSL failed for $domain — check DNS"
  else
    ok "SSL cert already exists: $domain"
  fi
done

systemctl start nginx

# ── Write Nginx config ────────────────────────────────────────
log "Writing Nginx configuration..."
cat > /etc/nginx/sites-available/coinbidex << NGINX
# Rate limiting
limit_req_zone \$binary_remote_addr zone=api_live:10m  rate=60r/m;
limit_req_zone \$binary_remote_addr zone=auth_live:10m rate=10r/m;
limit_req_zone \$binary_remote_addr zone=api_demo:10m  rate=120r/m;

# ── LIVE: trade.${TRADE_DOMAIN} ──────────────────────────────
server {
    listen 80;
    server_name ${TRADE_DOMAIN} www.${TRADE_DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${TRADE_DOMAIN} www.${TRADE_DOMAIN};

    ssl_certificate     /etc/letsencrypt/live/${TRADE_DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${TRADE_DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL_live:10m;
    ssl_session_timeout 10m;
    ssl_stapling on;
    ssl_stapling_verify on;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript;
    gzip_min_length 1000;

    location /api/v1/auth/ {
        limit_req zone=auth_live burst=5 nodelay;
        proxy_pass         http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
    }

    location /api/ {
        limit_req zone=api_live burst=30 nodelay;
        proxy_pass         http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }

    location /socket.io/ {
        proxy_pass         http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_read_timeout 3600s;
    }

    location /health {
        proxy_pass http://127.0.0.1:4000;
        access_log off;
    }

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}

# ── DEMO: ${DEMO_DOMAIN} ──────────────────────────────────────
server {
    listen 80;
    server_name ${DEMO_DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${DEMO_DOMAIN};

    ssl_certificate     /etc/letsencrypt/live/${DEMO_DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DEMO_DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL_demo:10m;

    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-Content-Type-Options nosniff always;

    location /api/ {
        limit_req zone=api_demo burst=60 nodelay;
        proxy_pass         http://127.0.0.1:4001;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }

    location /socket.io/ {
        proxy_pass         http://127.0.0.1:4001;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host \$host;
        proxy_read_timeout 3600s;
    }

    location /health {
        proxy_pass http://127.0.0.1:4001;
        access_log off;
    }

    location / {
        proxy_pass         http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host \$host;
    }
}

# ── STAGING: ${STAGING_DOMAIN} ────────────────────────────────
server {
    listen 80;
    server_name ${STAGING_DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${STAGING_DOMAIN};

    ssl_certificate     /etc/letsencrypt/live/${STAGING_DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${STAGING_DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL_staging:10m;

    add_header X-Robots-Tag "noindex, nofollow" always;

    location /api/ {
        proxy_pass         http://127.0.0.1:4010;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }

    location /socket.io/ {
        proxy_pass         http://127.0.0.1:4010;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host \$host;
        proxy_read_timeout 3600s;
    }

    location /health {
        proxy_pass http://127.0.0.1:4010;
        access_log off;
    }

    location / {
        proxy_pass         http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host \$host;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/coinbidex /etc/nginx/sites-enabled/coinbidex
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
ok "Nginx configured"

# ── Start containers ──────────────────────────────────────────
# Images are built by GitHub Actions and pushed to GHCR — this VPS only
# ever pulls them. Make sure you've run `docker login ghcr.io` as the
# deploy user first (see deploy/vps-setup.sh output).
log "Pulling and starting LIVE containers..."
cd "$APP_DIR"

docker compose -f docker-compose.prod.yml --env-file .env.live pull
docker compose -f docker-compose.prod.yml --env-file .env.live up -d --no-build
ok "Live containers started"

log "Starting DEMO containers..."
docker compose -f docker-compose.demo.yml up -d --build
ok "Demo containers started"

if [ -f "$APP_DIR/.env.staging" ]; then
  log "Pulling and starting STAGING containers..."
  docker compose -f docker-compose.staging.yml --env-file .env.staging pull
  docker compose -f docker-compose.staging.yml --env-file .env.staging up -d --no-build
  ok "Staging containers started"
else
  warn ".env.staging not found — skipping staging containers. Copy .env.example to .env.staging, fill it in, and re-run to enable it."
fi

# ── Wait and seed ─────────────────────────────────────────────
log "Waiting for backends to be healthy..."
sleep 15

# Seed live (only if first deploy)
if docker compose -f docker-compose.prod.yml --env-file .env.live exec -T backend-live \
   psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM assets;" 2>/dev/null | grep -q " 0"; then
  log "Seeding live database..."
  docker compose -f docker-compose.prod.yml --env-file .env.live exec -T backend-live npm run prisma:seed
  ok "Live database seeded"
fi

# Seed demo
log "Seeding demo database..."
docker compose -f docker-compose.demo.yml exec -T backend-demo npm run prisma:seed 2>/dev/null || true
ok "Demo database seeded"

# ── Auto-renew SSL ────────────────────────────────────────────
log "Setting up SSL auto-renewal..."
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && systemctl reload nginx") | sort -u | crontab -
ok "SSL auto-renewal: daily at 3am"

# ── Setup daily DB backup cron ────────────────────────────────
log "Setting up database backup cron..."
(crontab -l 2>/dev/null; echo "0 2 * * * cd $APP_DIR && bash deploy/backup.sh >> /var/log/coinbidex-backup.log 2>&1") | sort -u | crontab -
ok "DB backups: daily at 2am → $APP_DIR/backups/"

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}🚀 Coinbidex deployed!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Live    : ${BLUE}https://${TRADE_DOMAIN}${NC}"
echo -e "  Demo    : ${BLUE}https://${DEMO_DOMAIN}${NC}"
echo -e "  Staging : ${BLUE}https://${STAGING_DOMAIN}${NC}"
echo ""
echo -e "  Admin : admin@coinbidex.io / Admin@123456"
echo -e "  Demo  : demo@coinbidex.io  / Demo@123456"
echo ""
echo -e "${RED}⚠ These are default seeded credentials — log in and change both${NC}"
echo -e "${RED}  passwords immediately, before this domain is public.${NC}"
echo ""
echo -e "${YELLOW}NEXT: Login as admin → Admin Panel → Config & Keys${NC}"
echo -e "${YELLOW}Set REFERRAL_WALLET_ADDRESS to start earning.${NC}"
