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

// Maps every tracked USDT pair to its CoinGecko coin id, so the CoinGecko
// fallback can cover exactly the same assets Binance does — not just the
// dozen or so majors. If Binance is geo-blocked (as it is from some VPS
// regions — HTTP 451), this is the ONLY price source, so gaps here show up
// directly as permanently-stuck-at-0 assets on the site.
const SYMBOL_TO_CG_ID: Record<string, string> = {
  BTCUSDT: 'bitcoin', ETHUSDT: 'ethereum', BNBUSDT: 'binancecoin',
  SOLUSDT: 'solana', XRPUSDT: 'ripple', ADAUSDT: 'cardano',
  DOGEUSDT: 'dogecoin', DOTUSDT: 'polkadot', UNIUSDT: 'uniswap',
  LINKUSDT: 'chainlink', MATICUSDT: 'matic-network', AVAXUSDT: 'avalanche-2',
  LTCUSDT: 'litecoin', TRXUSDT: 'tron', ATOMUSDT: 'cosmos',
  NEARUSDT: 'near', APTUSDT: 'aptos', ARBUSDT: 'arbitrum',
  OPUSDT: 'optimism', INJUSDT: 'injective-protocol', SUIUSDT: 'sui',
  SEIUSDT: 'sei-network', TIAUSDT: 'celestia', FTMUSDT: 'fantom',
  LDOUSDT: 'lido-dao', AAVEUSDT: 'aave', MKRUSDT: 'maker',
  CRVUSDT: 'curve-dao-token', SNXUSDT: 'havven', COMPUSDT: 'compound-governance-token',
};
const CG_ID_TO_SYMBOL = Object.fromEntries(Object.entries(SYMBOL_TO_CG_ID).map(([sym, id]) => [id, sym]));

let binanceWs: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let wsConnected = false;

// ── Binance circuit breaker ─────────────────────────────────────
// Binance returning HTTP 451 ("Unavailable For Legal Reasons") means the
// VPS's IP/region is geo-blocked — that's permanent, not a transient
// network blip, and it applies to every Binance endpoint (WS, REST ticker,
// REST klines) at once. Retrying every one of those every few seconds
// forever wastes time on every request (a full connect/timeout cycle) and
// is exactly the kind of pattern that looks like abusive traffic to the
// remote API. Once we detect the block, stop calling Binance entirely for
// a cooldown window and go straight to the CoinGecko fallback everywhere;
// re-check occasionally in case the block lifts (e.g. after a VPS move).
let binanceBlockedUntil = 0;
const BINANCE_BLOCK_COOLDOWN_MS = 60 * 60_000; // recheck once an hour

function markBinanceBlocked(reason: string) {
  binanceBlockedUntil = Date.now() + BINANCE_BLOCK_COOLDOWN_MS;
  logger.warn(`Binance appears blocked from this host (${reason}) — ` +
    `pausing all Binance calls for ${BINANCE_BLOCK_COOLDOWN_MS / 60000} min, using CoinGecko only.`);
}

function isBinanceAvailable() {
  return Date.now() >= binanceBlockedUntil;
}

// Cache TTL must comfortably outlive the poll interval, or every ticker
// value goes stale (reads as missing / renders as 0) in the gap between
// one poll's cache expiring and the next poll refreshing it.
function tickerTtlSeconds() {
  return Math.ceil(BASE_POLL_INTERVAL_MS() / 1000) + 120;
}

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

// Shared by both the Binance and CoinGecko paths so the DB-persisted
// fallback (used when Redis cache is empty) stays fresh regardless of
// which upstream source actually supplied the data.
async function persistMarketToDb(symbol: string, data: {
  lastPrice: number; priceChange: number; priceChangePct: number;
  volume24h: number; high24h: number; low24h: number;
}) {
  await prisma.market.updateMany({
    where: { symbol },
    data: {
      lastPrice:      data.lastPrice,
      priceChange24h: data.priceChange,
      priceChangePct: data.priceChangePct,
      volume24h:      data.volume24h,
      high24h:        data.high24h,
      low24h:         data.low24h,
      updatedAt:      new Date(),
    }
  }).catch(() => {});
}

async function fetchInitialMarketData() {
  if (!isBinanceAvailable()) {
    await fetchFromCoinGecko();
    return;
  }

  try {
    const res = await axios.get(`${BINANCE_REST}/ticker/24hr`, { timeout: 10000 });
    const tickers = res.data;
    let updated = 0;
    const ttl = tickerTtlSeconds();

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
      await cache.set(`ticker:${ticker.symbol}`,               data, ttl);
      await cache.set(`ticker:${ticker.symbol.toLowerCase()}`, data, ttl);
      updated++;

      await persistMarketToDb(ticker.symbol, data);
    }
    logger.info(`Market data: updated ${updated} tickers from Binance`);
    consecutiveFailures = 0;
  } catch (err: any) {
    consecutiveFailures++;
    const status = err.response?.status;
    if (status === 451 || status === 403) {
      markBinanceBlocked(`HTTP ${status} on REST ticker poll`);
    }
    logger.warn(`Binance REST failed (${err.message}), trying CoinGecko fallback. ` +
      `Consecutive failures: ${consecutiveFailures} (next poll backs off accordingly)`);
    await fetchFromCoinGecko();
  }
}

async function fetchFromCoinGecko() {
  try {
    const ids = Object.keys(CG_ID_TO_SYMBOL).join(',');
    const res = await axios.get(`${COINGECKO}/coins/markets`, {
      timeout: 15000,
      params: {
        vs_currency: 'usd',
        ids,
        order: 'market_cap_desc',
        per_page: 250,
        page: 1,
        price_change_percentage: '24h',
      }
    });

    const ttl = tickerTtlSeconds();
    let updated = 0;

    for (const coin of res.data) {
      const sym = CG_ID_TO_SYMBOL[coin.id];
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
      await cache.set(`ticker:${sym}`,               data, ttl);
      await cache.set(`ticker:${sym.toLowerCase()}`, data, ttl);
      await persistMarketToDb(sym, data);
      updated++;
    }
    logger.info(`Market data: CoinGecko fallback updated ${updated} tickers`);
  } catch (err: any) {
    logger.error('Both Binance and CoinGecko failed:', { message: err.message });
  }
}

let wsReconnectAttempts = 0;
const WS_MAX_BACKOFF_MS = 5 * 60_000; // cap at 5 minutes between attempts

function connectBinanceWebSocket(io: SocketIOServer) {
  if (!isBinanceAvailable()) {
    // Don't even attempt the socket during a known block window — just
    // check back once the cooldown expires.
    reconnectTimer = setTimeout(() => connectBinanceWebSocket(io), BINANCE_BLOCK_COOLDOWN_MS);
    return;
  }

  try {
    const streams = TRACKED_SYMBOLS.map(s => `${s}@miniTicker`).join('/');
    const url = `${BINANCE_WS}${streams}`;
    binanceWs = new WebSocket(url);

    binanceWs.on('open', () => {
      wsConnected = true;
      wsReconnectAttempts = 0;
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

        const ttl = tickerTtlSeconds();
        await cache.set(`ticker:${ticker.s}`,               update, ttl);
        await cache.set(`ticker:${ticker.s.toLowerCase()}`, update, ttl);

        io.to(`market:${ticker.s}`).emit('ticker:update', update);
        io.emit('ticker:all', update);
      } catch {}
    });

    binanceWs.on('close', (code: number) => {
      wsConnected = false;
      if (code === 1008 || code === 451) markBinanceBlocked(`WS closed with code ${code}`);
      wsReconnectAttempts++;
      const delay = isBinanceAvailable()
        ? Math.min(5000 * 2 ** wsReconnectAttempts, WS_MAX_BACKOFF_MS)
        : BINANCE_BLOCK_COOLDOWN_MS;
      logger.warn(`Binance WS closed, reconnecting in ${Math.round(delay / 1000)}s... (attempt ${wsReconnectAttempts})`);
      reconnectTimer = setTimeout(() => connectBinanceWebSocket(io), delay);
    });

    binanceWs.on('error', (err: Error) => {
      // err.message alone can print as empty depending on the logger's
      // formatting of a second string argument — log the whole error object
      // so the real reason (e.g. a 451 geo-block, DNS failure, etc) is
      // actually visible instead of a bare "Binance WS error:" line.
      logger.error('Binance WS error:', { message: err.message, stack: err.stack });
    });
  } catch (err: any) {
    logger.error('WS connect failed:', { message: err.message });
    setTimeout(() => connectBinanceWebSocket(io), 10000);
  }
}

// CoinGecko's free OHLC endpoint only supports a fixed set of day-ranges
// with fixed candle granularity (4h candles for 1-2 day ranges, daily for
// longer). It's not a perfect match for every interval the UI might ask
// for, but it's real, non-empty chart data instead of a permanently blank
// graph — which is what happens today with no fallback here at all.
const CG_DAYS_FOR_INTERVAL: Record<string, number> = {
  '1m': 1, '5m': 1, '15m': 1, '30m': 1, '1h': 1,
  '4h': 7, '1d': 30, '1w': 90,
};

export async function getCandleData(symbol: string, interval: string, limit = 500) {
  const cacheKey = `candles:${symbol}:${interval}:${limit}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  if (isBinanceAvailable()) {
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
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 451 || status === 403) markBinanceBlocked(`HTTP ${status} on klines`);
      // fall through to CoinGecko below
    }
  }

  const cgId = SYMBOL_TO_CG_ID[symbol.toUpperCase()];
  if (!cgId) return [];

  try {
    const days = CG_DAYS_FOR_INTERVAL[interval] ?? 1;
    const res = await axios.get(`${COINGECKO}/coins/${cgId}/ohlc`, {
      params: { vs_currency: 'usd', days },
      timeout: 10000,
    });
    const candles = res.data.slice(-limit).map((c: number[]) => ({
      time:   Math.floor(c[0] / 1000),
      open:   c[1],
      high:   c[2],
      low:    c[3],
      close:  c[4],
      volume: 0, // CoinGecko's OHLC endpoint doesn't include volume per-candle
    }));
    await cache.set(cacheKey, candles, 300);
    return candles;
  } catch (err: any) {
    logger.error(`Candle fallback failed for ${symbol}:`, { message: err.message });
    return [];
  }
}

export async function getMarketTicker(symbol: string) {
  const sym = symbol.toUpperCase();
  let ticker = await cache.get(`ticker:${sym}`);
  if (ticker) return ticker;

  if (isBinanceAvailable()) {
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
      await cache.set(`ticker:${sym}`, data, tickerTtlSeconds());
      return data;
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 451 || status === 403) markBinanceBlocked(`HTTP ${status} on single ticker`);
      // fall through to CoinGecko below
    }
  }

  const cgId = SYMBOL_TO_CG_ID[sym];
  if (!cgId) return null;

  try {
    const res = await axios.get(`${COINGECKO}/coins/markets`, {
      params: { vs_currency: 'usd', ids: cgId },
      timeout: 8000,
    });
    const coin = res.data?.[0];
    if (!coin) return null;
    const data = {
      symbol:         sym,
      lastPrice:      coin.current_price,
      priceChange:    coin.price_change_24h,
      priceChangePct: coin.price_change_percentage_24h,
      volume24h:      coin.total_volume / coin.current_price,
      high24h:        coin.high_24h,
      low24h:         coin.low_24h,
      timestamp:      Date.now(),
    };
    await cache.set(`ticker:${sym}`, data, tickerTtlSeconds());
    return data;
  } catch (err: any) {
    logger.error(`Ticker fallback failed for ${sym}:`, { message: err.message });
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
