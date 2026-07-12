import { Router, Request, Response } from 'express';
import { verifyStripeWebhook, handleStripeEvent } from '../services/paymentService';
import { logger } from '../utils/logger';

const router = Router();

// Mounted in index.ts with express.raw({ type: 'application/json' }) instead
// of the app-wide express.json() — Stripe's signature verification needs
// the exact raw bytes of the request body. If this route ever receives an
// already-JSON-parsed body, signature verification will fail every time,
// even with a correct webhook secret — this is the single most common
// mistake in Stripe webhook integrations.
router.post('/stripe/webhook', async (req: Request, res: Response) => {
  const signature = req.headers['stripe-signature'] as string;
  if (!signature) return res.status(400).send('Missing stripe-signature header');

  let event;
  try {
    event = verifyStripeWebhook(req.body, signature);
  } catch (err: any) {
    logger.error('Stripe webhook signature verification failed:', { message: err.message });
    return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
  }

  try {
    await handleStripeEvent(event);
    res.json({ received: true });
  } catch (err: any) {
    logger.error('Stripe webhook handler error:', { message: err.message });
    // Still 200 — Stripe retries on non-2xx, and a handler bug shouldn't
    // cause the same webhook to hammer us repeatedly. We log it instead.
    res.json({ received: true, handlerError: true });
  }
});

export default router;
