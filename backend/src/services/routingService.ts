/**
 * Routing Service
 *
 * Single source of truth for deciding HOW each swap/trade gets executed.
 * The user always sees "Cryptex" — routing is invisible to them.
 *
 * Priority order:
 *  1. 1inch API (real DEX, best rate, earns referral fee on-chain)
 *  2. Binance Broker (for trading pairs, earns fee rebate)
 *  3. Internal price estimate (fallback, still earns markup)
 */

import { logger } from '../utils/logger';
import { cache } from '../utils/redis';

export type SwapRoute = 'oneinch' | 'internal_estimate';
export type TradeRoute = 'binance_broker' | 'internal_matching';

export interface RouteStatus {
  swap: {
    route: SwapRoute;
    active: boolean;
    note: string;
    earns: string;
  };
  trade: {
    route: TradeRoute;
    active: boolean;
    note: string;
    earns: string;
  };
  deposit: {
    route: string;
    active: boolean;
    note: string;
    earns: string;
  };
}

// Determine active swap route based on env config
export function getSwapRoute(): SwapRoute {
  if (process.env.ONEINCH_API_KEY) return 'oneinch';
  return 'internal_estimate';
}

// Determine active trade route
export function getTradeRoute(): TradeRoute {
  if (process.env.BINANCE_BROKER_API_KEY && process.env.BINANCE_BROKER_API_SECRET) {
    return 'binance_broker';
  }
  return 'internal_matching';
}

// Full status of all routes — used by admin dashboard and health check
export function getRouteStatus(): RouteStatus {
  const swapRoute  = getSwapRoute();
  const tradeRoute = getTradeRoute();
  const moonpaySet = !!(process.env.MOONPAY_PUBLISHABLE_KEY && process.env.MOONPAY_SECRET_KEY);
  const referralSet = !!(process.env.REFERRAL_WALLET_ADDRESS &&
    process.env.REFERRAL_WALLET_ADDRESS !== '0x0000000000000000000000000000000000000000');

  return {
    swap: {
      route:  swapRoute,
      active: true, // always active — fallback always works
      note:   swapRoute === 'oneinch'
        ? `Live: routing through 1inch DEX aggregator${referralSet ? ' with referral fee' : ' (set REFERRAL_WALLET_ADDRESS to earn on-chain fees)'}`
        : 'Fallback: using Binance ticker prices. Add ONEINCH_API_KEY at portal.1inch.dev (free) for real DEX rates + referral earnings.',
      earns:  swapRoute === 'oneinch'
        ? `${process.env.SWAP_MARKUP_PCT || '0.3'}% markup + ${(parseInt(process.env.REFERRAL_FEE_BPS || '30') / 100).toFixed(2)}% 1inch referral`
        : `${process.env.SWAP_MARKUP_PCT || '0.3'}% markup on every swap`,
    },
    trade: {
      route:  tradeRoute,
      active: true,
      note:   tradeRoute === 'binance_broker'
        ? 'Live: orders routed to Binance Broker sub-accounts'
        : 'Fallback: internal order matching. Apply at binance.com/en/broker to earn fee rebates on every trade.',
      earns:  tradeRoute === 'binance_broker'
        ? `${(parseFloat(process.env.BROKER_COMMISSION_RATE || '0.4') * 100).toFixed(0)}% of Binance trading fee per trade`
        : 'No trading fee revenue yet — add Binance Broker keys',
    },
    deposit: {
      route:  moonpaySet ? 'moonpay_live' : 'moonpay_test',
      active: true,
      note:   moonpaySet
        ? 'Live: MoonPay widget embedded, webhook crediting wallets automatically'
        : 'Test mode: add MOONPAY_PUBLISHABLE_KEY and MOONPAY_SECRET_KEY from moonpay.com/business/partners',
      earns:  moonpaySet
        ? '0.5–1% of every card/bank purchase'
        : 'No deposit revenue yet — add MoonPay partner keys',
    },
  };
}

// Log every routed swap for audit trail
export async function logSwapRoute(
  userId: string,
  fromAsset: string,
  toAsset: string,
  fromAmount: number,
  toAmount: number,
  route: SwapRoute,
  markupEarned: number,
  referralEarned: number
) {
  const logEntry = {
    ts: new Date().toISOString(),
    userId,
    from: `${fromAmount} ${fromAsset}`,
    to:   `${toAmount} ${toAsset}`,
    route,
    markupEarned,
    referralEarned,
    totalEarned: markupEarned + referralEarned,
  };

  logger.info(`SWAP_ROUTED: ${JSON.stringify(logEntry)}`);

  // Keep a rolling 24h swap count per route for the dashboard
  const key = `routing:swaps:${route}:${new Date().toISOString().slice(0, 10)}`;
  await cache.get(key).then(async (val: any) => {
    const current = val ? JSON.parse(val) : { count: 0, volume: 0, earned: 0 };
    await cache.set(key, JSON.stringify({
      count:  current.count  + 1,
      volume: current.volume + fromAmount,
      earned: current.earned + markupEarned + referralEarned,
    }), 86400);
  }).catch(() => {});
}

// Get today's routing stats
export async function getTodayRoutingStats() {
  const today = new Date().toISOString().slice(0, 10);
  const [oneinch, internal, broker, matching] = await Promise.all([
    cache.get(`routing:swaps:oneinch:${today}`),
    cache.get(`routing:swaps:internal_estimate:${today}`),
    cache.get(`routing:trades:binance_broker:${today}`),
    cache.get(`routing:trades:internal_matching:${today}`),
  ]);

  return {
    swaps: {
      oneinch:  oneinch  || { count: 0, volume: 0, earned: 0 },
      internal: internal || { count: 0, volume: 0, earned: 0 },
    },
    trades: {
      broker:   broker   || { count: 0, volume: 0, earned: 0 },
      internal: matching || { count: 0, volume: 0, earned: 0 },
    },
  };
}
