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
# if a key ever leaks. It also gets sudo (password-protected) for the
# rare manual task, and is in the docker group so it never needs sudo
# just to run docker/docker compose.
log "Creating deploy user..."
if ! id -u deploy &>/dev/null; then
  adduser --disabled-password --gecos "" deploy
  ok "User 'deploy' created"
else
  ok "User 'deploy' already exists"
fi
usermod -aG docker deploy
usermod -aG sudo deploy
ok "'deploy' is in the docker and sudo groups"

if ! passwd -S deploy | grep -q " P "; then
  echo ""
  warn "Set a login password for 'deploy' (needed for sudo — SSH access still uses keys only):"
  passwd deploy
fi

# ── 8. Project folder structure ──────────────────────────────
# /var/www/coinbidex/
#   ├── trading-coinbidex/            (git: main branch    → production)
#   ├── staging-trading-coinbidex/    (git: staging branch → staging)
#   ├── coinbidex-site/               (placeholder for a future project)
#   ├── shared/                       (pgAdmin etc. — not from git)
#   └── backups/
log "Creating folder structure..."
mkdir -p /var/www/coinbidex/{trading-coinbidex,staging-trading-coinbidex,coinbidex-site,shared,backups/{live,staging}}
chown -R deploy:deploy /var/www/coinbidex
ok "Structure created under /var/www/coinbidex (owned by deploy)"
echo "  New projects later: just 'mkdir /var/www/coinbidex/<name>' and clone into it — same pattern."

# ── 9. SSH key: GitHub Actions → this VPS (for automated deploys) ──
# The PRIVATE half becomes the GitHub secret VPS_SSH_KEY. The PUBLIC half
# goes in deploy's authorized_keys. These steps are idempotent — safe to
# re-run this script any time without breaking existing access.
log "Setting up the GitHub-Actions → VPS deploy key..."
mkdir -p /home/deploy/.ssh
touch /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
if [ ! -f /home/deploy/.ssh/coinbidex_deploy ]; then
  sudo -u deploy ssh-keygen -t ed25519 -f /home/deploy/.ssh/coinbidex_deploy -N "" -C "github-actions-to-vps"
  ok "Generated /home/deploy/.ssh/coinbidex_deploy"
fi
if ! grep -qf /home/deploy/.ssh/coinbidex_deploy.pub /home/deploy/.ssh/authorized_keys 2>/dev/null; then
  cat /home/deploy/.ssh/coinbidex_deploy.pub >> /home/deploy/.ssh/authorized_keys
  ok "Public key added to authorized_keys"
else
  ok "Public key already in authorized_keys"
fi
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/coinbidex_deploy
echo ""
warn "COPY THE PRIVATE KEY BELOW into GitHub → repo → Settings → Secrets and variables → Actions → New secret named VPS_SSH_KEY:"
echo ""
cat /home/deploy/.ssh/coinbidex_deploy
echo ""

# ── 10. SSH key: this VPS → GitHub repo (read-only, for git pull) ──
# Private repos need auth to clone/pull. Rather than tie this to any one
# person's GitHub account (which breaks if that person leaves or rotates
# their password), we use a repo-scoped Deploy Key: a keypair that only
# ever grants read access to this one repo, registered directly on the repo.
log "Setting up the VPS → GitHub repo-read key (Deploy Key)..."
if [ ! -f /home/deploy/.ssh/github_repo_deploy ]; then
  sudo -u deploy ssh-keygen -t ed25519 -f /home/deploy/.ssh/github_repo_deploy -N "" -C "vps-repo-readonly"
  ok "Generated /home/deploy/.ssh/github_repo_deploy"
fi
if ! grep -q "github_repo_deploy" /home/deploy/.ssh/config 2>/dev/null; then
  cat >> /home/deploy/.ssh/config << 'SSHCONF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/github_repo_deploy
  IdentitiesOnly yes
SSHCONF
  ok "SSH config updated so 'git clone git@github.com:...' uses this key automatically"
fi
chown -R deploy:deploy /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/config /home/deploy/.ssh/github_repo_deploy
echo ""
warn "COPY THE PUBLIC KEY BELOW into GitHub → coinbidex/trading-coinbidex repo → Settings → Deploy keys → Add deploy key (read-only, do NOT tick 'Allow write access'):"
echo ""
cat /home/deploy/.ssh/github_repo_deploy.pub
echo ""

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ VPS base setup done. Next steps:${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo "1. Add the VPS_SSH_KEY secret and Deploy Key printed above to GitHub."
echo "2. As the deploy user, clone the two branches:"
echo "     su - deploy"
echo "     git clone -b main    git@github.com:coinbidex/trading-coinbidex.git /var/www/coinbidex/trading-coinbidex"
echo "     git clone -b staging git@github.com:coinbidex/trading-coinbidex.git /var/www/coinbidex/staging-trading-coinbidex"
echo "3. Log the VPS into GHCR (see DEPLOYMENT_GUIDE.md) so it can pull private images."
echo "4. Fill in .env.live and .env.staging in each folder (copy from .env.example)."
echo "5. Run: bash /var/www/coinbidex/trading-coinbidex/deploy/deploy.sh trade.coinbidex.com you@yourdomain.com"
echo ""
echo "Server IP: $(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
echo ""
