import axios from 'axios';
import { logger } from '../utils/logger';
import { cache } from '../utils/redis';

// 1inch v5 API - free, no key needed for basic use
// Sign up at portal.1inch.dev for higher rate limits
const INCH_BASE = 'https://api.1inch.dev/swap/v6.0';
const INCH_API_KEY = process.env.ONEINCH_API_KEY || '';

// Token contract addresses on Ethereum mainnet
// For other chains, update accordingly
const TOKEN_ADDRESSES: Record<string, string> = {
  ETH:   '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  USDT:  '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  USDC:  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  WBTC:  '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
  BNB:   '0xB8c77482e45F1F44dE1745F52C74426C631bDD52',
  MATIC: '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0',
  LINK:  '0x514910771AF9Ca656af840dff83E8264EcF986CA',
  UNI:   '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
  AAVE:  '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',
  SOL:   '', // SOL is not on Ethereum - would need Solana DEX
};

// Your referral wallet address - SET THIS to your ETH address to earn fees
const REFERRAL_ADDRESS = process.env.REFERRAL_WALLET_ADDRESS || '0x0000000000000000000000000000000000000000';
const REFERRAL_FEE = 1.5; // 30 = 0.3% (in basis points, max 300)

// Your markup on top of quoted rate (profit margin)
const MARKUP_PCT = parseFloat(process.env.SWAP_MARKUP_PCT || '0.3'); // 0.3%

const inchHeaders = INCH_API_KEY
  ? { Authorization: `Bearer ${INCH_API_KEY}` }
  : {};

export interface SwapQuoteResult {
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;         // what user receives (after our markup)
  rawToAmount: string;      // 1inch's quoted amount
  exchangeRate: number;
  markupRate: number;
  fee: number;
  feeAsset: string;
  priceImpact: number;
  validFor: number;
  route: string;
  isReal: boolean;          // true = real 1inch quote, false = fallback estimate
  chainId: number;
}

export async function getOneInchQuote(
  fromSymbol: string,
  toSymbol: string,
  fromAmountHuman: number,
  chainId = 1  // 1=Ethereum, 56=BSC, 137=Polygon
): Promise<SwapQuoteResult> {
  const from = fromSymbol.toUpperCase();
  const to   = toSymbol.toUpperCase();

  const fromAddress = TOKEN_ADDRESSES[from];
  const toAddress   = TOKEN_ADDRESSES[to];

  // If we have token addresses, try real 1inch API
  if (fromAddress && toAddress && INCH_API_KEY) {
    try {
      const cacheKey = `1inch:quote:${from}:${to}:${fromAmountHuman}:${chainId}`;
      const cached = await cache.get<SwapQuoteResult>(cacheKey);
      if (cached) return cached;

      // Get token decimals from known values
      const fromDecimals = from === 'USDT' || from === 'USDC' ? 6 : 18;
      const toDecimals   = to   === 'USDT' || to   === 'USDC' ? 6 : 18;

      const fromAmountWei = BigInt(Math.floor(fromAmountHuman * 10 ** fromDecimals)).toString();

      const res = await axios.get(`${INCH_BASE}/${chainId}/quote`, {
        headers: inchHeaders,
        params: {
          src: fromAddress,
          dst: toAddress,
          amount: fromAmountWei,
          referrerAddress: REFERRAL_ADDRESS,
          fee: 1.5,
          includeGas: true,
        },
        timeout: 8000,
      });

      const data = res.data;
      const rawToAmountHuman = parseFloat(data.dstAmount) / 10 ** toDecimals;

      // Apply our markup: we quote slightly less than 1inch gives us
      const markup = rawToAmountHuman * (MARKUP_PCT / 100);
      const toAmountAfterMarkup = rawToAmountHuman - markup;

      const result: SwapQuoteResult = {
        fromToken:    from,
        toToken:      to,
        fromAmount:   fromAmountHuman.toString(),
        toAmount:     toAmountAfterMarkup.toFixed(8),
        rawToAmount:  rawToAmountHuman.toFixed(8),
        exchangeRate: toAmountAfterMarkup / fromAmountHuman,
        markupRate:   MARKUP_PCT,
        fee:          markup,
        feeAsset:     to,
        priceImpact:  parseFloat(data.priceImpact || '0'),
        validFor:     30,
        route:        data.protocols?.[0]?.[0]?.[0]?.name || '1inch',
        isReal:       true,
        chainId,
      };

      await cache.set(cacheKey, result, 15); // 15s cache
      return result;
    } catch (err: any) {
      logger.warn(`1inch API error for ${from}→${to}: ${err.message}. Falling back to price estimate.`);
    }
  }

  // Fallback: estimate from cached ticker prices (no API key or unsupported token)
  return await estimateFromTickers(from, to, fromAmountHuman);
}

async function estimateFromTickers(from: string, to: string, amount: number): Promise<SwapQuoteResult> {
  const fromTicker = await cache.get<any>(`ticker:${from}USDT`) || await cache.get<any>(`ticker:USDT${from}`);
  const toTicker   = await cache.get<any>(`ticker:${to}USDT`)   || await cache.get<any>(`ticker:USDT${to}`);

  let rate: number;
  if      (from === 'USDT') rate = 1 / (toTicker?.lastPrice || 1);
  else if (to   === 'USDT') rate = fromTicker?.lastPrice || 1;
  else {
    const fromUsd = fromTicker?.lastPrice || 1;
    const toUsd   = toTicker?.lastPrice   || 1;
    rate = fromUsd / toUsd;
  }

  const rawToAmount = amount * rate;
  const markup      = rawToAmount * (MARKUP_PCT / 100);
  const toAmount    = rawToAmount - markup;

  return {
    fromToken: from, toToken: to,
    fromAmount: amount.toString(),
    toAmount: toAmount.toFixed(8),
    rawToAmount: rawToAmount.toFixed(8),
    exchangeRate: toAmount / amount,
    markupRate: MARKUP_PCT,
    fee: markup, feeAsset: to,
    priceImpact: 0.01,
    validFor: 30,
    route: 'price-estimate',
    isReal: false,
    chainId: 0,
  };
}

// Build the actual transaction data for on-chain execution
// Used when user has connected external wallet
export async function buildSwapTransaction(
  fromSymbol: string,
  toSymbol: string,
  fromAmountHuman: number,
  userWalletAddress: string,
  slippagePct = 0.5,
  chainId = 1
): Promise<any> {
  const from = fromSymbol.toUpperCase();
  const to   = toSymbol.toUpperCase();
  const fromAddress = TOKEN_ADDRESSES[from];
  const toAddress   = TOKEN_ADDRESSES[to];

  if (!fromAddress || !toAddress) {
    throw new Error(`Token ${from} or ${to} not supported for on-chain swap`);
  }
  if (!INCH_API_KEY) {
    throw new Error('1inch API key required for transaction building');
  }

  const fromDecimals  = from === 'USDT' || from === 'USDC' ? 6 : 18;
  const fromAmountWei = BigInt(Math.floor(fromAmountHuman * 10 ** fromDecimals)).toString();

  const res = await axios.get(`${INCH_BASE}/${chainId}/swap`, {
    headers: inchHeaders,
    params: {
      src: fromAddress,
      dst: toAddress,
      amount: fromAmountWei,
      from: userWalletAddress,
      slippage: slippagePct,
      referrerAddress: REFERRAL_ADDRESS,
      fee: REFERRAL_FEE,
      disableEstimate: false,
    },
    timeout: 10000,
  });

  return res.data.tx; // ready-to-sign transaction object
}

export async function getSupportedTokens(chainId = 1): Promise<any[]> {
  try {
    const cacheKey = `1inch:tokens:${chainId}`;
    const cached = await cache.get<any[]>(cacheKey);
    if (cached) return cached;

    const res = await axios.get(`${INCH_BASE}/${chainId}/tokens`, {
      headers: inchHeaders,
      timeout: 8000,
    });

    const tokens = Object.values(res.data.tokens || {});
    await cache.set(cacheKey, tokens, 3600); // 1hr cache
    return tokens;
  } catch {
    return Object.entries(TOKEN_ADDRESSES)
      .filter(([, addr]) => addr)
      .map(([symbol, address]) => ({ symbol, address }));
  }
}
