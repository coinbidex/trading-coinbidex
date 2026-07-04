import WebSocket from 'ws';
import { Server as SocketIOServer } from 'socket.io';
import { prisma } from '../utils/prisma';
import { cache } from '../utils/redis';
import { logger } from '../utils/logger';
import axios from 'axios';

const BINANCE_WS   = 'wss://stream.binance.com:9443/stream?streams=';
const BINANCE_REST = 'https://api.binance.com/api/v3';
const COINGECKO    = 'https://api.coingecko.com/api/v3';

// Expanded tracked symbols
const TRACKED_SYMBOLS = [
  'btcusdt','ethusdt','bnbusdt','solusdt','xrpusdt',
  'adausdt','dogeusdt','dotusdt','uniusdt','linkusdt',
  'maticusdt','avaxusdt','ltcusdt','trxusdt','atomusdt',
  'nearusdt','aptusdt','arbusdt','opusdt','injusdt',
  'suiusdt','seiusdt','tiausdt','ftmusdt','ldousdt',
  'aaveusdt','mkrusdt','crvusdt','snxusdt','compusdt',
];

let binanceWs: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let wsConnected = false;

// Binance WS above is the live, push-based feed for price ticks — it does the
// real-time work. This REST poll is only a backfill/fallback (24h stats on
// cold start, and coverage if the WS drops), so it doesn't need to run often.
// Default 5 minutes, matches typical practice on similar-sized platforms.
// Configurable via MARKET_DATA_POLL_INTERVAL_MS (can be changed from the
// admin Settings panel without a redeploy, since it's DB-backed config).
const BASE_POLL_INTERVAL_MS = () => parseInt(process.env.MARKET_DATA_POLL_INTERVAL_MS || '300000', 10);
const MAX_BACKOFF_MS = 30 * 60_000; // never back off past 30 min between attempts

let consecutiveFailures = 0;
let pollTimer: NodeJS.Timeout | null = null;

export async function startMarketDataService(io: SocketIOServer) {
  await fetchInitialMarketData();
  connectBinanceWebSocket(io);
  schedulePoll();
}

function schedulePoll() {
  if (pollTimer) clearTimeout(pollTimer);
  const backoffMultiplier = Math.min(2 ** consecutiveFailures, 8); // cap at 8x
  const delay = Math.min(BASE_POLL_INTERVAL_MS() * backoffMultiplier, MAX_BACKOFF_MS);
  pollTimer = setTimeout(async () => {
    await fetchInitialMarketData();
    schedulePoll();
  }, delay);
}

async function fetchInitialMarketData() {
  try {
    const res = await axios.get(`${BINANCE_REST}/ticker/24hr`, { timeout: 10000 });
    const tickers = res.data;
    let updated = 0;

    for (const ticker of tickers) {
      const sym = ticker.symbol.toLowerCase();
      if (!TRACKED_SYMBOLS.includes(sym)) continue;

      const data = {
        symbol:        ticker.symbol,
        lastPrice:     parseFloat(ticker.lastPrice),
        priceChange:   parseFloat(ticker.priceChange),
        priceChangePct:parseFloat(ticker.priceChangePercent),
        volume24h:     parseFloat(ticker.volume),
        quoteVolume24h:parseFloat(ticker.quoteVolume),
        high24h:       parseFloat(ticker.highPrice),
        low24h:        parseFloat(ticker.lowPrice),
        openPrice:     parseFloat(ticker.openPrice),
        timestamp:     Date.now(),
      };

      // Cache with BOTH key formats so nothing gets a 404
      await cache.set(`ticker:${ticker.symbol}`,           data, 120);
      await cache.set(`ticker:${ticker.symbol.toLowerCase()}`, data, 120);
      updated++;

      // Update DB
      await prisma.market.updateMany({
        where: { symbol: ticker.symbol },
        data: {
          lastPrice:     data.lastPrice,
          priceChange24h:data.priceChange,
          priceChangePct:data.priceChangePct,
          volume24h:     data.volume24h,
          high24h:       data.high24h,
          low24h:        data.low24h,
          updatedAt:     new Date(),
        }
      }).catch(() => {});
    }
    logger.info(`Market data: updated ${updated} tickers from Binance`);
    consecutiveFailures = 0;
  } catch (err: any) {
    consecutiveFailures++;
    logger.warn(`Binance REST failed (${err.message}), trying CoinGecko fallback. ` +
      `Consecutive failures: ${consecutiveFailures} (next poll backs off accordingly)`);
    await fetchFromCoinGecko();
  }
}

async function fetchFromCoinGecko() {
  try {
    const res = await axios.get(`${COINGECKO}/coins/markets`, {
      timeout: 15000,
      params: {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: 50,
        page: 1,
        price_change_percentage: '24h',
      }
    });

    const coinMap: Record<string, string> = {
      bitcoin: 'BTCUSDT', ethereum: 'ETHUSDT', binancecoin: 'BNBUSDT',
      solana: 'SOLUSDT', ripple: 'XRPUSDT', cardano: 'ADAUSDT',
      dogecoin: 'DOGEUSDT', polkadot: 'DOTUSDT', uniswap: 'UNIUSDT',
      chainlink: 'LINKUSDT', 'matic-network': 'MATICUSDT',
      avalanche: 'AVAXUSDT', litecoin: 'LTCUSDT', cosmos: 'ATOMUSDT',
      tron: 'TRXUSDT',
    };

    for (const coin of res.data) {
      const sym = coinMap[coin.id];
      if (!sym) continue;
      const data = {
        symbol:         sym,
        lastPrice:      coin.current_price,
        priceChange:    coin.price_change_24h,
        priceChangePct: coin.price_change_percentage_24h,
        volume24h:      coin.total_volume / coin.current_price,
        quoteVolume24h: coin.total_volume,
        high24h:        coin.high_24h,
        low24h:         coin.low_24h,
        openPrice:      coin.current_price - coin.price_change_24h,
        marketCap:      coin.market_cap,
        timestamp:      Date.now(),
      };
      await cache.set(`ticker:${sym}`, data, 120);
      await cache.set(`ticker:${sym.toLowerCase()}`, data, 120);
    }
    logger.info('Market data: CoinGecko fallback succeeded');
  } catch (err: any) {
    logger.error('Both Binance and CoinGecko failed:', err.message);
  }
}

function connectBinanceWebSocket(io: SocketIOServer) {
  try {
    const streams = TRACKED_SYMBOLS.map(s => `${s}@miniTicker`).join('/');
    const url = `${BINANCE_WS}${streams}`;
    binanceWs = new WebSocket(url);

    binanceWs.on('open', () => {
      wsConnected = true;
      logger.info('Binance WebSocket connected');
    });

    binanceWs.on('message', async (raw: Buffer) => {
      try {
        const { data: ticker } = JSON.parse(raw.toString());
        if (!ticker?.s) return;

        const update = {
          symbol:         ticker.s,
          lastPrice:      parseFloat(ticker.c),
          priceChange:    parseFloat(ticker.p),
          priceChangePct: parseFloat(ticker.P),
          volume24h:      parseFloat(ticker.v),
          quoteVolume24h: parseFloat(ticker.q),
          high24h:        parseFloat(ticker.h),
          low24h:         parseFloat(ticker.l),
          openPrice:      parseFloat(ticker.o),
          timestamp:      ticker.E,
        };

        await cache.set(`ticker:${ticker.s}`, update, 30);
        await cache.set(`ticker:${ticker.s.toLowerCase()}`, update, 30);

        io.to(`market:${ticker.s}`).emit('ticker:update', update);
        io.emit('ticker:all', update);
      } catch {}
    });

    binanceWs.on('close', () => {
      wsConnected = false;
      logger.warn('Binance WS closed, reconnecting in 5s...');
      reconnectTimer = setTimeout(() => connectBinanceWebSocket(io), 5000);
    });

    binanceWs.on('error', (err) => {
      logger.error('Binance WS error:', err.message);
    });
  } catch (err: any) {
    logger.error('WS connect failed:', err.message);
    setTimeout(() => connectBinanceWebSocket(io), 10000);
  }
}

export async function getCandleData(symbol: string, interval: string, limit = 500) {
  const cacheKey = `candles:${symbol}:${interval}:${limit}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  try {
    const res = await axios.get(`${BINANCE_REST}/klines`, {
      params: { symbol: symbol.toUpperCase(), interval, limit },
      timeout: 10000,
    });
    const candles = res.data.map((c: any[]) => ({
      time:   Math.floor(c[0] / 1000),
      open:   parseFloat(c[1]),
      high:   parseFloat(c[2]),
      low:    parseFloat(c[3]),
      close:  parseFloat(c[4]),
      volume: parseFloat(c[5]),
    }));
    await cache.set(cacheKey, candles, 60);
    return candles;
  } catch {
    return [];
  }
}

export async function getMarketTicker(symbol: string) {
  // Try uppercase first, then original
  const sym = symbol.toUpperCase();
  let ticker = await cache.get(`ticker:${sym}`);
  if (ticker) return ticker;

  // Try fetching directly from Binance
  try {
    const res = await axios.get(`${BINANCE_REST}/ticker/24hr`, {
      params: { symbol: sym },
      timeout: 5000,
    });
    const t = res.data;
    const data = {
      symbol:         t.symbol,
      lastPrice:      parseFloat(t.lastPrice),
      priceChange:    parseFloat(t.priceChange),
      priceChangePct: parseFloat(t.priceChangePercent),
      volume24h:      parseFloat(t.volume),
      high24h:        parseFloat(t.highPrice),
      low24h:         parseFloat(t.lowPrice),
      timestamp:      Date.now(),
    };
    await cache.set(`ticker:${sym}`, data, 30);
    return data;
  } catch {
    return null;
  }
}

export async function getAllTickers() {
  const results: any[] = [];
  for (const sym of TRACKED_SYMBOLS) {
    const val = await cache.get(`ticker:${sym.toUpperCase()}`);
    if (val) results.push(val);
  }
  return results;
}

export async function getCryptoNews(limit = 20) {
  const cacheKey = 'news:crypto';
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  try {
    const res = await axios.get('https://cryptopanic.com/api/v1/posts/', {
      params: { auth_token: 'free', kind: 'news', public: 'true' },
      timeout: 8000,
    });
    const news = res.data.results?.slice(0, limit).map((n: any) => ({
      id:          n.id,
      title:       n.title,
      url:         n.url,
      source:      n.source?.title,
      publishedAt: n.published_at,
      currencies:  n.currencies?.map((c: any) => c.code),
    })) || [];
    await cache.set(cacheKey, news, 300);
    return news;
  } catch {
    return [];
  }
}

export function isWsConnected() { return wsConnected; }
