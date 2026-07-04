# ── Build stage ──────────────────────────────────────────────
FROM node:24-alpine AS builder

WORKDIR /app

RUN npm config set fetch-timeout 600000 && \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

# Build-time env vars
ARG VITE_PLATFORM_MODE=demo
ARG VITE_APP_TITLE=Coinbidex
ARG VITE_DEMO_BANNER=true
ARG VITE_API_BASE=""
ARG VITE_WS_URL=""
ARG VITE_WALLETCONNECT_PROJECT_ID=""
ARG VITE_DEMO_URL="http://localhost:3001"
ARG VITE_LIVE_URL="http://localhost:3000"

ENV VITE_PLATFORM_MODE=$VITE_PLATFORM_MODE
ENV VITE_APP_TITLE=$VITE_APP_TITLE
ENV VITE_DEMO_BANNER=$VITE_DEMO_BANNER
ENV VITE_API_BASE=$VITE_API_BASE
ENV VITE_WS_URL=$VITE_WS_URL
ENV VITE_WALLETCONNECT_PROJECT_ID=$VITE_WALLETCONNECT_PROJECT_ID
ENV VITE_DEMO_URL=$VITE_DEMO_URL
ENV VITE_LIVE_URL=$VITE_LIVE_URL

# Build production static files
RUN npm run build

# ── Serve stage ───────────────────────────────────────────────
FROM node:24-alpine AS runner

WORKDIR /app

# Use serve to host the static build
RUN npm install -g serve

COPY --from=builder /app/dist ./dist

EXPOSE 3000

# Serve static build — no Vite, no dev server, no host restrictions
CMD ["serve", "-s", "dist", "-l", "3000"]
