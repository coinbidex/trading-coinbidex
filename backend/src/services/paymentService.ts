import Stripe from 'stripe';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { activatePromotion } from './promoActivationService';

// Read the key lazily (not at module load) since it can be set from the
// admin Settings panel (SystemConfig -> process.env) after the process has
// already started — see routes/config.ts's loadConfigsFromDB/live-sync.
function getStripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: '2024-11-20.acacia' });
}

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_WEBHOOK_SECRET;
}

export async function createStripeCheckoutSession(invoice: {
  id: string; invoiceNumber: string; amount: any; currency: string; userId: string;
}, successUrl: string, cancelUrl: string) {
  const stripe = getStripeClient();
  if (!stripe) throw new Error('Stripe is not configured — set STRIPE_SECRET_KEY in Admin Settings');

  const user = await prisma.user.findUnique({ where: { id: invoice.userId } });

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: user?.email,
    line_items: [{
      price_data: {
        currency: invoice.currency.toLowerCase(),
        product_data: { name: `CoinBidex Invoice ${invoice.invoiceNumber}` },
        unit_amount: Math.round(Number(invoice.amount) * 100), // Stripe uses cents
      },
      quantity: 1,
    }],
    // Correlates the webhook event back to this invoice — Stripe echoes
    // metadata back on every event derived from this session.
    metadata: { invoiceId: invoice.id },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { provider: 'STRIPE', providerRef: session.id },
  });

  return session;
}

// IMPORTANT: the caller must pass the RAW (unparsed) request body here —
// Stripe's signature check fails against JSON-parsed-then-restringified
// bodies because whitespace/key-order can differ from what Stripe signed.
// See routes/payments.ts, which mounts this route with express.raw()
// instead of the app-wide express.json() middleware.
export function verifyStripeWebhook(rawBody: Buffer, signature: string): Stripe.Event {
  const stripe = getStripeClient();
  if (!stripe) throw new Error('Stripe is not configured');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

export async function handleStripeEvent(event: Stripe.Event) {
  if (event.type !== 'checkout.session.completed') return;

  const session = event.data.object as Stripe.Checkout.Session;
  const invoiceId = session.metadata?.invoiceId;
  if (!invoiceId) {
    logger.warn(`Stripe checkout.session.completed with no invoiceId in metadata (session ${session.id})`);
    return;
  }

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) {
    logger.error(`Stripe webhook: invoice ${invoiceId} not found`);
    return;
  }
  if (invoice.status === 'PAID') return; // already processed — webhooks can fire more than once

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: 'PAID', paidAt: new Date() },
  });

  logger.info(`Invoice ${invoice.invoiceNumber} marked PAID via Stripe (session ${session.id})`);
  await activatePromotion(invoiceId);
}
