import { Router } from 'express';
import { Request, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import {
  getMoonPayUrl, verifyMoonPayWebhook, handleMoonPayWebhook,
  getMoonPayCurrencies, isMoonPayConfigured
} from '../services/moonPayService';
import { logger } from '../utils/logger';

const router = Router();

// Get a signed MoonPay widget URL for the user
router.get('/url', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { currency = 'eth', amount, fiat = 'usd' } = req.query;
    const user = req.user!;

    const url = getMoonPayUrl({
      currencyCode:          currency as string,
      baseCurrencyCode:      fiat as string,
      baseCurrencyAmount:    amount ? parseFloat(amount as string) : undefined,
      externalTransactionId: user.id,  // so webhook can credit the right user
      theme:                 'dark',
      colorCode:             '#14b8a6',
    });

    res.json({
      success: true,
      data: {
        url,
        configured: isMoonPayConfigured(),
        note: !isMoonPayConfigured()
          ? 'Set MOONPAY_PUBLISHABLE_KEY and MOONPAY_SECRET_KEY to go live. Get keys at moonpay.com/business/partners'
          : undefined
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Failed to generate MoonPay URL' });
  }
});

// Get supported currencies
router.get('/currencies', async (req: Request, res: Response) => {
  try {
    const currencies = await getMoonPayCurrencies();
    res.json({ success: true, data: currencies });
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Failed to get currencies' });
  }
});

// Webhook from MoonPay — credit user wallet on completed purchase
// Must be publicly accessible (no auth) — MoonPay calls this
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['moonpay-signature-v2'] as string
                   || req.headers['x-webhook-signature']  as string
                   || '';
    const body = JSON.stringify(req.body);

    if (!verifyMoonPayWebhook(body, signature)) {
      logger.warn('MoonPay webhook: invalid signature');
      return res.status(401).json({ success: false, message: 'Invalid signature' });
    }

    await handleMoonPayWebhook(req.body);
    res.json({ success: true });
  } catch (err: any) {
    logger.error('MoonPay webhook error:', err);
    res.status(500).json({ success: false, message: 'Webhook processing failed' });
  }
});

export default router;
