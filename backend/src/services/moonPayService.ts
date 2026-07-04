import crypto from 'crypto';
import axios from 'axios';
import { logger } from '../utils/logger';
import { prisma } from '../utils/prisma';

const MOONPAY_PK   = process.env.MOONPAY_PUBLISHABLE_KEY || 'pk_test_key';
const MOONPAY_SK   = process.env.MOONPAY_SECRET_KEY      || '';
const MOONPAY_BASE = 'https://buy.moonpay.com';

// MoonPay pays 0.5–1% on every transaction to partners
// Sign up at https://www.moonpay.com/business/partners

export interface MoonPayUrlParams {
  currencyCode: string;       // e.g. 'eth', 'btc', 'usdt_erc20'
  walletAddress?: string;     // user's wallet — if they have one connected
  baseCurrencyCode?: string;  // fiat currency, e.g. 'usd', 'gbp', 'zar'
  baseCurrencyAmount?: number;
  email?: string;
  externalTransactionId?: string;
  colorCode?: string;
  theme?: 'light' | 'dark';
}

// Generate a signed MoonPay widget URL
// The signature prevents URL tampering and is required in production
export function getMoonPayUrl(params: MoonPayUrlParams): string {
  const query = new URLSearchParams({
    apiKey:      MOONPAY_PK,
    currencyCode: params.currencyCode || 'eth',
    colorCode:   encodeURIComponent(params.colorCode || '#14b8a6'),
    theme:       params.theme || 'dark',
    ...(params.walletAddress           && { walletAddress:           params.walletAddress }),
    ...(params.baseCurrencyCode        && { baseCurrencyCode:        params.baseCurrencyCode }),
    ...(params.baseCurrencyAmount      && { baseCurrencyAmount:      params.baseCurrencyAmount.toString() }),
    ...(params.email                   && { email:                   params.email }),
    ...(params.externalTransactionId   && { externalTransactionId:   params.externalTransactionId }),
  });

  const urlWithQuery = `${MOONPAY_BASE}?${query.toString()}`;

  // Sign the URL if we have a secret key (required in production)
  if (MOONPAY_SK) {
    const signature = crypto
      .createHmac('sha256', MOONPAY_SK)
      .update(new URL(urlWithQuery).search)
      .digest('base64');
    return `${urlWithQuery}&signature=${encodeURIComponent(signature)}`;
  }

  return urlWithQuery;
}

// Verify incoming MoonPay webhook signature
export function verifyMoonPayWebhook(body: string, signature: string): boolean {
  if (!MOONPAY_SK) return true; // skip in dev
  try {
    const expected = crypto
      .createHmac('sha256', MOONPAY_SK)
      .update(body)
      .digest('base64');
    return expected === signature;
  } catch {
    return false;
  }
}

// Handle completed purchase webhook — credit user wallet
export async function handleMoonPayWebhook(payload: any): Promise<void> {
  try {
    const { type, data } = payload;

    if (type !== 'transaction_updated') return;

    const tx = data;
    logger.info(`MoonPay webhook: ${tx.status} — ${tx.cryptoTransactionId}`);

    if (tx.status !== 'completed') return;

    // Find user by externalTransactionId (we set this to userId when generating URL)
    const userId = tx.externalTransactionId;
    if (!userId) {
      logger.warn('MoonPay webhook: no externalTransactionId');
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    // Map MoonPay currency code to our asset symbol
    const symbol = mapMoonPayCurrency(tx.currency?.code || '');
    if (!symbol) {
      logger.warn(`Unknown MoonPay currency: ${tx.currency?.code}`);
      return;
    }

    const asset = await prisma.asset.findUnique({ where: { symbol } });
    if (!asset) return;

    const amount = parseFloat(tx.cryptoTransactionId ? tx.quoteCurrencyAmount : '0');

    // Credit the user's wallet
    await prisma.$transaction([
      prisma.wallet.upsert({
        where: { userId_assetId: { userId, assetId: asset.id } },
        create: { userId, assetId: asset.id, balance: amount, totalDeposited: amount },
        update: { balance: { increment: amount }, totalDeposited: { increment: amount } }
      }),
      prisma.transaction.create({
        data: {
          userId,
          type: 'DEPOSIT',
          status: 'COMPLETED',
          asset: symbol,
          amount,
          fee: 0,
          netAmount: amount,
          txHash: tx.cryptoTransactionId,
          description: `MoonPay purchase — ${amount} ${symbol}`,
          processedAt: new Date(),
          metadata: {
            moonpayId: tx.id,
            fiatAmount: tx.baseCurrencyAmount,
            fiatCurrency: tx.baseCurrency?.code,
          }
        }
      }),
      prisma.notification.create({
        data: {
          userId,
          type: 'DEPOSIT_COMPLETE',
          title: 'Deposit received',
          message: `${amount} ${symbol} has been credited to your wallet`,
        }
      })
    ]);

    logger.info(`Credited ${amount} ${symbol} to user ${userId} via MoonPay`);
  } catch (err: any) {
    logger.error(`MoonPay webhook error: ${err.message}`);
    throw err;
  }
}

function mapMoonPayCurrency(code: string): string | null {
  const map: Record<string, string> = {
    'eth':       'ETH',
    'btc':       'BTC',
    'usdt':      'USDT',
    'usdt_erc20':'USDT',
    'bnb':       'BNB',
    'sol':       'SOL',
    'matic':     'MATIC',
    'usdc':      'USDC',
    'ada':       'ADA',
    'dot':       'DOT',
    'link':      'LINK',
    'doge':      'DOGE',
  };
  return map[code.toLowerCase()] || null;
}

// Get list of MoonPay supported currencies with limits
export async function getMoonPayCurrencies(): Promise<any[]> {
  try {
    const res = await axios.get('https://api.moonpay.com/v3/currencies', {
      params: { apiKey: MOONPAY_PK },
      timeout: 8000,
    });
    return (res.data || []).filter((c: any) => c.type === 'crypto' && c.isSupportedInUS);
  } catch {
    // Return common ones as fallback
    return [
      { code: 'btc',  name: 'Bitcoin',  minBuyAmount: 25,  maxBuyAmount: 10000 },
      { code: 'eth',  name: 'Ethereum', minBuyAmount: 25,  maxBuyAmount: 10000 },
      { code: 'usdt_erc20', name: 'Tether USD', minBuyAmount: 25, maxBuyAmount: 10000 },
      { code: 'sol',  name: 'Solana',   minBuyAmount: 25,  maxBuyAmount: 10000 },
      { code: 'bnb',  name: 'BNB',      minBuyAmount: 25,  maxBuyAmount: 10000 },
    ];
  }
}

export function isMoonPayConfigured(): boolean {
  return MOONPAY_PK !== 'pk_test_key';
}
