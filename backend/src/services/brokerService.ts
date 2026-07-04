import Binance from 'binance';
import { logger } from '../utils/logger';
import { cache } from '../utils/redis';
import { prisma } from '../utils/prisma';

// Binance Broker Programme credentials
// Apply at: https://www.binance.com/en/broker
// Once approved you get BROKER_API_KEY and BROKER_SECRET
const BROKER_API_KEY    = process.env.BINANCE_BROKER_API_KEY    || process.env.BINANCE_API_KEY    || '';
const BROKER_API_SECRET = process.env.BINANCE_BROKER_API_SECRET || process.env.BINANCE_API_SECRET || '';
const USE_TESTNET       = process.env.BINANCE_TESTNET === 'true';
const BROKER_ENABLED    = !!(BROKER_API_KEY && BROKER_API_SECRET);

// Your broker commission rate (set in Binance Broker dashboard)
// Binance pays you up to 40% of the trading fee
// e.g. 0.1% taker fee × 40% rebate = 0.04% per trade back to you
const BROKER_COMMISSION_RATE = parseFloat(process.env.BROKER_COMMISSION_RATE || '0.4');

let binanceClient: any = null;

function getClient() {
  if (!binanceClient && BROKER_ENABLED) {
    binanceClient = new (Binance as any)({
      apiKey:    BROKER_API_KEY,
      apiSecret: BROKER_API_SECRET,
      ...(USE_TESTNET && { baseUrl: 'https://testnet.binance.vision' }),
    });
  }
  return binanceClient;
}

export interface BrokerOrderResult {
  success: boolean;
  orderId?: string;
  binanceOrderId?: number;
  symbol: string;
  side: string;
  type: string;
  price: number;
  quantity: number;
  filledQty: number;
  avgPrice: number;
  status: string;
  fee: number;
  feeAsset: string;
  isReal: boolean;  // true = routed to real Binance, false = internal matching
  error?: string;
}

// Route an order to Binance Broker
export async function routeOrderToBinance(
  userId: string,
  symbol: string,        // e.g. 'BTCUSDT'
  side: 'BUY' | 'SELL',
  type: 'MARKET' | 'LIMIT',
  quantity: number,
  price?: number,
): Promise<BrokerOrderResult> {

  if (!BROKER_ENABLED) {
    logger.info(`Broker not configured — order ${symbol} ${side} will use internal matching`);
    return {
      success: false,
      symbol, side, type,
      price: price || 0,
      quantity, filledQty: 0,
      avgPrice: 0, status: 'PENDING',
      fee: 0, feeAsset: 'BNB',
      isReal: false,
      error: 'Broker not configured'
    };
  }

  try {
    const client = getClient();

    // Get or create sub-account for this user
    const subAccount = await getOrCreateSubAccount(userId);

    const params: any = {
      symbol: symbol.toUpperCase(),
      side,
      type,
      quantity: quantity.toFixed(6),
      ...(type === 'LIMIT' && price && {
        price: price.toFixed(2),
        timeInForce: 'GTC',
      }),
    };

    logger.info(`Routing order to Binance Broker: ${JSON.stringify(params)}`);

    // Place order on sub-account
    const order = await client.subAccount?.order(subAccount.email, params)
                  || await client.order(params); // fallback to main account

    const filled   = parseFloat(order.executedQty || '0');
    const avgPrice = parseFloat(order.fills?.[0]?.price || order.price || '0');
    const fee      = filled * avgPrice * 0.001; // ~0.1% taker fee

    // Log what we earned from this trade
    const ourEarning = fee * BROKER_COMMISSION_RATE;
    logger.info(`Broker order executed. Fee: ${fee}, Our earning: ${ourEarning}`);

    return {
      success: true,
      orderId: order.clientOrderId,
      binanceOrderId: order.orderId,
      symbol, side, type,
      price: price || avgPrice,
      quantity, filledQty: filled,
      avgPrice, status: order.status,
      fee, feeAsset: order.fills?.[0]?.commissionAsset || 'BNB',
      isReal: true,
    };
  } catch (err: any) {
    logger.error(`Binance broker order failed: ${err.message}`);
    return {
      success: false,
      symbol, side, type,
      price: price || 0,
      quantity, filledQty: 0,
      avgPrice: 0, status: 'FAILED',
      fee: 0, feeAsset: 'BNB',
      isReal: true,
      error: err.message,
    };
  }
}

// Create or retrieve Binance sub-account for a user
async function getOrCreateSubAccount(userId: string): Promise<{ email: string }> {
  const cacheKey = `broker:subaccount:${userId}`;
  const cached   = await cache.get<{ email: string }>(cacheKey);
  if (cached) return cached;

  try {
    const user   = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    // Sub-account email format required by Binance
    const subEmail = `${user.username.replace(/[^a-z0-9]/gi, '')}@${process.env.BROKER_SUBEMAIL_DOMAIN || 'cryptex-sub.com'}`;

    const client = getClient();

    // Try to create sub-account (will fail if already exists — that's fine)
    try {
      await client.createSubAccount?.({ email: subEmail });
      logger.info(`Created Binance sub-account: ${subEmail}`);
    } catch (e: any) {
      if (!e.message?.includes('already exists')) {
        logger.warn(`Sub-account creation warning: ${e.message}`);
      }
    }

    const result = { email: subEmail };
    await cache.set(cacheKey, result, 86400); // cache 24h
    return result;
  } catch (err: any) {
    logger.error(`Sub-account error: ${err.message}`);
    return { email: `fallback-${userId}@broker.com` };
  }
}

// Get real-time price from Binance for display
export async function getBinancePrice(symbol: string): Promise<number | null> {
  if (!BROKER_ENABLED) return null;
  try {
    const client = getClient();
    const ticker = await client.prices({ symbol: symbol.toUpperCase() });
    return parseFloat(ticker[symbol.toUpperCase()] || '0') || null;
  } catch {
    return null;
  }
}

// Check if broker mode is active
export function isBrokerEnabled(): boolean {
  return BROKER_ENABLED;
}

// Get broker earnings summary
export async function getBrokerEarnings(): Promise<{ enabled: boolean; commissionRate: number; note: string }> {
  return {
    enabled: BROKER_ENABLED,
    commissionRate: BROKER_COMMISSION_RATE,
    note: BROKER_ENABLED
      ? `Live broker mode — earning ${(BROKER_COMMISSION_RATE * 100).toFixed(0)}% of trading fees`
      : 'Configure BINANCE_BROKER_API_KEY to enable. Apply at binance.com/en/broker'
  };
}
