# Coinbidex — Trading Platform

## Folder: trading-coinbidex

---

## Run locally on Windows

### Demo (http://localhost:3001 + backend :4001)
```powershell
docker-compose -f docker-compose.demo.yml up -d --build
# First run takes 3-5 min (npm install)
# Admin:  admin@coinbidex.io / Admin@123456
# Trader: demo@coinbidex.io  / Demo@123456
```

### Live locally (http://localhost:3000 + backend :4000)
```powershell
# Copy and fill .env.live first
copy .env.example .env.live
# Edit .env.live — set DB_PASSWORD, JWT_SECRET etc
docker-compose -f docker-compose.live.yml --env-file .env.live up -d --build
```

### Run BOTH at same time
Both can run simultaneously — different ports, different databases, no conflict.

### Reset demo data
```powershell
docker-compose -f docker-compose.demo.yml down -v
docker-compose -f docker-compose.demo.yml up -d --build
```

### Logs
```powershell
docker-compose -f docker-compose.demo.yml logs -f backend-demo
docker-compose -f docker-compose.live.yml logs -f backend-live
```

---

## Push to Git

```bash
# First time
git init
git remote add origin https://github.com/YOURUSERNAME/trading-coinbidex.git
git add .
git commit -m "Initial commit"
git branch -M main
git push -u origin main

# Updates
git add .
git commit -m "Update"
git push
```

---

## Deploy to VPS (trade.coinbidex.com + v1.coinbidex.com)

### 1. On VPS — install prerequisites
```bash
curl -fsSL https://get.docker.com | sh
apt-get install -y docker-compose-plugin nginx certbot python3-certbot-nginx
```

### 2. Clone repo
```bash
mkdir -p /opt/coinbidex && cd /opt/coinbidex
git clone https://github.com/YOURUSERNAME/trading-coinbidex.git .
```

### 3. Create secrets file
```bash
cat > .env.live << EOF
DOMAIN=trade.coinbidex.com
DB_PASSWORD=$(openssl rand -hex 32)
REDIS_PASSWORD=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 64)
JWT_REFRESH_SECRET=$(openssl rand -hex 64)
REFERRAL_WALLET_ADDRESS=0xYOUR_ETH_WALLET
ONEINCH_API_KEY=
MOONPAY_PUBLISHABLE_KEY=
MOONPAY_SECRET_KEY=
SMTP_HOST=
SMTP_USER=
SMTP_PASS=
ETH_RPC_URL=https://cloudflare-eth.com
EOF
```

### 4. Issue SSL certs
```bash
# For trade.coinbidex.com (live)
certbot certonly --standalone -d trade.coinbidex.com --email your@email.com --agree-tos --non-interactive

# For v1.coinbidex.com (demo)
certbot certonly --standalone -d v1.coinbidex.com --email your@email.com --agree-tos --non-interactive
```

### 5. Update nginx config with your domain
```bash
sed -i 's/TRADE_DOMAIN/trade.coinbidex.com/g' nginx/nginx.conf
```

### 6. Add to your EXISTING Nginx (since coinbidex.com already runs on port 80/443)
```bash
cat > /etc/nginx/sites-available/trade-coinbidex << 'NGINXEOF'
server {
    listen 443 ssl http2;
    server_name trade.coinbidex.com;
    ssl_certificate /etc/letsencrypt/live/trade.coinbidex.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/trade.coinbidex.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    location / {
        proxy_pass https://127.0.0.1:8443;
        proxy_ssl_verify off;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 3600s;
    }
}
server { listen 80; server_name trade.coinbidex.com; return 301 https://$host$request_uri; }
NGINXEOF

cat > /etc/nginx/sites-available/v1-coinbidex << 'NGINXEOF'
server {
    listen 443 ssl http2;
    server_name v1.coinbidex.com;
    ssl_certificate /etc/letsencrypt/live/v1.coinbidex.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/v1.coinbidex.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    location /api/ {
        proxy_pass http://127.0.0.1:4001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    location /socket.io/ {
        proxy_pass http://127.0.0.1:4001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
server { listen 80; server_name v1.coinbidex.com; return 301 https://$host$request_uri; }
NGINXEOF

ln -sf /etc/nginx/sites-available/trade-coinbidex /etc/nginx/sites-enabled/
ln -sf /etc/nginx/sites-available/v1-coinbidex    /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### 7. Start everything
```bash
# Live
docker-compose -f docker-compose.live.yml --env-file .env.live up -d --build

# Demo
docker-compose -f docker-compose.demo.yml up -d --build

# Seed databases
docker-compose -f docker-compose.live.yml exec backend-live npm run prisma:seed
docker-compose -f docker-compose.demo.yml exec backend-demo npm run prisma:seed
```

### 8. Test before DNS propagates
```bash
# Test live backend directly on VPS
curl http://localhost:4000/health
# Should return: {"status":"ok","mode":"live",...}

# Test demo
curl http://localhost:4001/health
# Should return: {"status":"ok","mode":"demo",...}

# Test live via nginx (what the outside world sees through your main nginx)
curl -k https://localhost:8443/health
```

### 9. Pull future updates
```bash
cd /opt/coinbidex
git pull origin main
docker-compose -f docker-compose.live.yml --env-file .env.live up -d --build
docker-compose -f docker-compose.demo.yml up -d --build
```

---

## Ports summary

| Service          | Local port | VPS external |
|-----------------|-----------|-------------|
| Live frontend   | 3000      | trade.coinbidex.com (via nginx) |
| Live backend    | 4000      | trade.coinbidex.com/api (via nginx) |
| Live nginx      | 8080/8443 | Internal only (main nginx proxies) |
| Demo frontend   | 3001      | v1.coinbidex.com (via main nginx) |
| Demo backend    | 4001      | v1.coinbidex.com/api (via main nginx) |
| Demo postgres   | 5433      | Not exposed |
| Live postgres   | Not exposed | Not exposed |

---

## After going live — first steps

1. Login as `admin@coinbidex.io` → **Admin Panel → Config & Keys**
2. Set `REFERRAL_WALLET_ADDRESS` = your ETH wallet → earn from every swap immediately
3. Set `ONEINCH_API_KEY` → real DEX rates (free at portal.1inch.dev)
4. Set `MOONPAY_PUBLISHABLE_KEY` → earn on card deposits

