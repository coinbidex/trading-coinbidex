#!/bin/bash
# =============================================================
# Coinbidex VPS Setup — run ONCE on fresh Ubuntu 22.04
# Usage: bash vps-setup.sh
# =============================================================
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${BLUE}▶ $1${NC}"; }
ok()   { echo -e "${GREEN}✅ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠  $1${NC}"; }

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║      Coinbidex VPS Setup Script          ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── 1. System update ─────────────────────────────────────────
log "Updating system..."
apt-get update -qq && apt-get upgrade -y -qq
apt-get install -y -qq curl wget git unzip htop ufw fail2ban
ok "System updated"

# ── 2. Docker ────────────────────────────────────────────────
log "Installing Docker..."
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  ok "Docker installed"
else
  ok "Docker already present"
fi

# ── 3. Docker Compose ────────────────────────────────────────
log "Installing Docker Compose..."
if ! docker compose version &>/dev/null 2>&1; then
  apt-get install -y docker-compose-plugin
fi
ok "Docker Compose ready: $(docker compose version --short)"

# ── 4. Nginx + Certbot ───────────────────────────────────────
log "Installing Nginx + Certbot..."
apt-get install -y nginx certbot python3-certbot-nginx
systemctl enable nginx
ok "Nginx + Certbot installed"

# ── 5. Firewall ──────────────────────────────────────────────
log "Configuring firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ok "Firewall: SSH + HTTP + HTTPS only"

# ── 6. Fail2ban ──────────────────────────────────────────────
log "Configuring fail2ban..."
systemctl enable fail2ban
systemctl start fail2ban
ok "Fail2ban active"

# ── 7. Create a non-root deploy user ─────────────────────────
# GitHub Actions SSHes in as this user, not root — smaller blast radius
# if the deploy key ever leaks.
log "Creating deploy user..."
if ! id -u deploy &>/dev/null; then
  adduser --disabled-password --gecos "" deploy
  usermod -aG docker deploy
  ok "User 'deploy' created and added to docker group"
else
  ok "User 'deploy' already exists"
fi

# ── 8. Create project directory (owned by deploy user) ───────
log "Creating project directory..."
mkdir -p /var/www/coinbidex
mkdir -p /var/www/coinbidex/backups
chown -R deploy:deploy /var/www/coinbidex
ok "Directory: /var/www/coinbidex (owned by deploy)"

# ── 9. SSH key for GitHub Actions deployment ─────────────────
log "Generating deploy SSH key..."
mkdir -p /home/deploy/.ssh
if [ ! -f /home/deploy/.ssh/coinbidex_deploy ]; then
  sudo -u deploy ssh-keygen -t ed25519 -f /home/deploy/.ssh/coinbidex_deploy -N "" -C "coinbidex-deploy"
  cat /home/deploy/.ssh/coinbidex_deploy.pub >> /home/deploy/.ssh/authorized_keys
  chown -R deploy:deploy /home/deploy/.ssh
  chmod 700 /home/deploy/.ssh
  chmod 600 /home/deploy/.ssh/authorized_keys
  ok "SSH key generated and authorized for the deploy user"
  echo ""
  warn "ADD THE PRIVATE KEY to your GitHub repo → Settings → Secrets → VPS_SSH_KEY:"
  echo ""
  cat /home/deploy/.ssh/coinbidex_deploy
  echo ""
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ VPS ready! Next: run ./deploy.sh${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo ""
echo "Server IP: $(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
echo ""
