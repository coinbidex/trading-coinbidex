#!/bin/bash
# =============================================================
# Coinbidex Deploy Script — run manually ONCE for the first bootstrap
# (SSL certs + nginx + initial container start for live, staging, and
# the shared pgAdmin). After this, ongoing deploys happen automatically
# via GitHub Actions (.github/workflows/deploy.yml), which only pulls
# pre-built images into the already-cloned folders — it never rebuilds
# or reconfigures nginx on the VPS.
#
# Expects this folder structure (created by deploy/vps-setup.sh):
#   /var/www/coinbidex/trading-coinbidex/            (this script's location)
#   /var/www/coinbidex/staging-trading-coinbidex/
#   /var/www/coinbidex/shared/
#
# Usage: bash deploy/deploy.sh trade.coinbidex.com you@yourdomain.com
# =============================================================
set -e

# This script writes to /etc/nginx, /etc/letsencrypt, and calls systemctl —
# all of which need root. Re-exec with sudo automatically instead of
# failing halfway through with confusing permission errors.
if [ "$EUID" -ne 0 ]; then
  echo "Root privileges needed for Nginx/Certbot/systemctl — re-running with sudo..."
  exec sudo -E bash "$0" "$@"
fi

# docker pull/compose below now run as root (we just elevated). If you did
# `docker login ghcr.io` as the deploy user earlier, root won't have those
# credentials yet — copy them over so the pull doesn't fail with "unauthorized".
if [ -f /home/deploy/.docker/config.json ] && [ ! -f /root/.docker/config.json ]; then
  mkdir -p /root/.docker
  cp /home/deploy/.docker/config.json /root/.docker/config.json
  echo "Copied GHCR login from deploy user to root."
fi

TRADE_DOMAIN=${1:?"Usage: bash deploy/deploy.sh trade.coinbidex.com you@yourdomain.com"}
EMAIL=${2:?"Usage: bash deploy/deploy.sh trade.coinbidex.com you@yourdomain.com"}
BASE_DOMAIN="${TRADE_DOMAIN#*.}"                 # coinbidex.com
STAGING_DOMAIN="staging.${BASE_DOMAIN}"
DB_UI_DOMAIN="db.${BASE_DOMAIN}"

LIVE_DIR="$(cd "$(dirname "$0")/.." && pwd)"                                    # .../trading-coinbidex
BASE_DIR="$(dirname "$LIVE_DIR")"                                                # .../coinbidex
STAGING_DIR="$BASE_DIR/staging-trading-coinbidex"
SHARED_DIR="$BASE_DIR/shared"

RED='\033[0;31m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${BLUE}▶ $1${NC}"; }
ok()   { echo -e "${GREEN}✅ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠  $1${NC}"; }
err()  { echo -e "${RED}❌ $1${NC}"; exit 1; }

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       Coinbidex Deploy Bootstrap         ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo -e "  Live    : ${BLUE}https://${TRADE_DOMAIN}${NC}   ($LIVE_DIR)"
echo -e "  Staging : ${BLUE}https://${STAGING_DOMAIN}${NC}   ($STAGING_DIR)"
echo -e "  DB UI   : ${BLUE}https://${DB_UI_DOMAIN}${NC}   ($SHARED_DIR)"
echo ""

# ── Env file template generator ────────────────────────────────
# $mode     = PLATFORM_MODE the app runs in (live/demo — app-level concept)
# $tag_pref = the image tag prefix CI actually pushes (see .github/workflows/build.yml:
#             main branch -> "prod", staging branch -> "staging"). These are NOT
#             always the same word as $mode, which is why they're separate args —
#             mixing them up is exactly what breaks `docker compose pull`.
make_env_template() {
  local dir=$1 domain=$2 mode=$3 tag_prefix=$4
  cat > "$dir/.env.$mode" << ENV
DOMAIN=${domain}
NODE_ENV=production
PLATFORM_MODE=${mode}
IMAGE_TAG=${tag_prefix}-latest

DB_PASSWORD=$(openssl rand -hex 32)
REDIS_PASSWORD=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 64)
JWT_REFRESH_SECRET=$(openssl rand -hex 64)

# SET THIS — your ETH wallet earns swap fees immediately (live only)
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
SMTP_FROM="Coinbidex <noreply@${domain}>"

VITE_WALLETCONNECT_PROJECT_ID=
ETH_RPC_URL=https://cloudflare-eth.com
POLY_RPC_URL=https://polygon-rpc.com
BSC_RPC_URL=https://bsc-dataseed.binance.org
ENV
}

NEEDS_ENV_FILL=0
if [ ! -f "$LIVE_DIR/.env.live" ]; then
  warn ".env.live not found — generating template in $LIVE_DIR"
  make_env_template "$LIVE_DIR" "$TRADE_DOMAIN" "live" "prod"
  NEEDS_ENV_FILL=1
fi
if [ ! -f "$STAGING_DIR/.env.staging" ]; then
  warn ".env.staging not found — generating template in $STAGING_DIR"
  make_env_template "$STAGING_DIR" "$STAGING_DOMAIN" "staging" "staging"
  NEEDS_ENV_FILL=1
fi
if [ $NEEDS_ENV_FILL -eq 1 ]; then
  warn "Edit the generated .env files (at least REFERRAL_WALLET_ADDRESS), then re-run this script."
  exit 0
fi

if [ ! -f "$SHARED_DIR/.env" ]; then
  warn "$SHARED_DIR/.env not found — copy $SHARED_DIR/.env.example to $SHARED_DIR/.env and fill in a pgAdmin login, then re-run."
  exit 0
fi

source "$LIVE_DIR/.env.live"

# ── Issue SSL certs ───────────────────────────────────────────
log "Issuing SSL certificates..."
systemctl stop nginx 2>/dev/null || true

for domain in "$TRADE_DOMAIN" "www.$TRADE_DOMAIN" "$STAGING_DOMAIN" "$DB_UI_DOMAIN"; do
  if [ ! -d "/etc/letsencrypt/live/$domain" ]; then
    certbot certonly --standalone \
      --email "$EMAIL" \
      --agree-tos --no-eff-email \
      -d "$domain" \
      --non-interactive --quiet && ok "SSL cert: $domain" || warn "SSL failed for $domain — check DNS points here first"
  else
    ok "SSL cert already exists: $domain"
  fi
done

systemctl start nginx

# ── Write Nginx config ────────────────────────────────────────
# Each server block only gets written if its cert actually exists — a DNS
# hiccup on one domain (e.g. staging not pointed here yet) shouldn't take
# down the other two working sites.
log "Writing Nginx configuration..."

# One-time cleanup: earlier versions of this script wrote to a shared
# /etc/nginx/sites-available/coinbidex file. Now every project gets its own
# file (trading-coinbidex, coinbidex-site, ...) so deploying one never
# clobbers another's config.
rm -f /etc/nginx/sites-enabled/coinbidex /etc/nginx/sites-available/coinbidex

cat > /etc/nginx/sites-available/trading-coinbidex << NGINX
# Rate limiting
limit_req_zone \$binary_remote_addr zone=api_live:10m  rate=60r/m;
limit_req_zone \$binary_remote_addr zone=auth_live:10m rate=10r/m;
NGINX

if [ -d "/etc/letsencrypt/live/$TRADE_DOMAIN" ]; then
cat >> /etc/nginx/sites-available/trading-coinbidex << NGINX

# ── LIVE: ${TRADE_DOMAIN} ────────────────────────────────────
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
NGINX
  ok "Nginx: live server block added"
else
  warn "Skipping live server block — no cert for $TRADE_DOMAIN yet"
fi

if [ -d "/etc/letsencrypt/live/$STAGING_DOMAIN" ]; then
cat >> /etc/nginx/sites-available/trading-coinbidex << NGINX

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
  ok "Nginx: staging server block added"
else
  warn "Skipping staging server block — no cert for $STAGING_DOMAIN yet (fix DNS, then re-run this script)"
fi

if [ -d "/etc/letsencrypt/live/$DB_UI_DOMAIN" ]; then
cat >> /etc/nginx/sites-available/trading-coinbidex << NGINX

# ── DB UI (pgAdmin): ${DB_UI_DOMAIN} ──────────────────────────
server {
    listen 80;
    server_name ${DB_UI_DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${DB_UI_DOMAIN};

    ssl_certificate     /etc/letsencrypt/live/${DB_UI_DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DB_UI_DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    add_header X-Robots-Tag "noindex, nofollow" always;

    location / {
        proxy_pass         http://127.0.0.1:5050;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
    }
}
NGINX
  ok "Nginx: db UI server block added"
else
  warn "Skipping db UI server block — no cert for $DB_UI_DOMAIN yet (fix DNS, then re-run this script)"
fi

ln -sf /etc/nginx/sites-available/trading-coinbidex /etc/nginx/sites-enabled/trading-coinbidex
rm -f /etc/nginx/sites-enabled/default
if ! nginx -t; then
  err "Nginx config test failed — see the error above. Not reloading nginx to avoid taking down what's already working. Fix the issue and re-run this script."
fi
systemctl reload nginx
ok "Nginx reloaded"

# ── Start containers ──────────────────────────────────────────
# Images are built by GitHub Actions and pushed to GHCR — this VPS only
# ever pulls them. Make sure you've run `docker login ghcr.io` as the
# deploy user first (see DEPLOYMENT_GUIDE.md).
log "Pulling and starting LIVE containers..."
cd "$LIVE_DIR"
docker compose -f docker-compose.prod.yml --env-file .env.live pull
docker compose -f docker-compose.prod.yml --env-file .env.live up -d --no-build
ok "Live containers started"

log "Pulling and starting STAGING containers..."
cd "$STAGING_DIR"
docker compose -f docker-compose.staging.yml --env-file .env.staging pull
docker compose -f docker-compose.staging.yml --env-file .env.staging up -d --no-build
ok "Staging containers started"

log "Starting shared pgAdmin (db.${BASE_DOMAIN})..."
cd "$SHARED_DIR"
docker compose --env-file .env up -d
ok "pgAdmin started"

# ── Wait and seed (first deploy only) ──────────────────────────
log "Waiting for backends to be healthy..."
sleep 15

cd "$LIVE_DIR"
if docker compose -f docker-compose.prod.yml --env-file .env.live exec -T backend-live \
   psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM assets;" 2>/dev/null | grep -q " 0"; then
  log "Seeding live database..."
  docker compose -f docker-compose.prod.yml --env-file .env.live exec -T backend-live npm run prisma:seed
  ok "Live database seeded"
fi

cd "$STAGING_DIR"
log "Seeding staging database (safe to run repeatedly — upserts only)..."
docker compose -f docker-compose.staging.yml --env-file .env.staging exec -T backend-staging npm run prisma:seed 2>/dev/null || true
ok "Staging database seeded"

# ── Auto-renew SSL ────────────────────────────────────────────
log "Setting up SSL auto-renewal..."
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && systemctl reload nginx") | sort -u | crontab -
ok "SSL auto-renewal: daily at 3am"

# ── Daily DB backup cron ───────────────────────────────────────
log "Setting up database backup cron..."
(crontab -l 2>/dev/null; echo "0 2 * * * bash $LIVE_DIR/deploy/backup.sh >> /var/log/coinbidex-backup.log 2>&1") | sort -u | crontab -
ok "DB backups: daily at 2am → $BASE_DIR/backups/"

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}🚀 Coinbidex deployed!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Live    : ${BLUE}https://${TRADE_DOMAIN}${NC}"
echo -e "  Staging : ${BLUE}https://${STAGING_DOMAIN}${NC}"
echo -e "  DB UI   : ${BLUE}https://${DB_UI_DOMAIN}${NC}"
echo ""
echo -e "  Admin : admin@coinbidex.io / Admin@123456"
echo ""
echo -e "${RED}⚠ This is a default seeded credential — log in and change it${NC}"
echo -e "${RED}  immediately, before this domain is public.${NC}"
echo ""
echo -e "${YELLOW}NEXT: Login as admin → Admin Panel → Config & Keys${NC}"
echo -e "${YELLOW}Set REFERRAL_WALLET_ADDRESS to start earning.${NC}"
