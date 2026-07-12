import { Response } from 'express';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { AuthRequest } from '../middleware/auth';
import { renderInvoicePdf } from '../services/invoiceService';
import { createStripeCheckoutSession, isStripeConfigured } from '../services/paymentService';
import { activatePromotion } from '../services/promoActivationService';
import { logAdminAction } from '../services/auditLogService';

export const getMyInvoices = async (req: AuthRequest, res: Response) => {
  const invoices = await prisma.invoice.findMany({
    where: { userId: req.user!.id },
    include: { package: true, listing: true, advertisement: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, data: invoices });
};

export const getInvoicePdf = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const invoice = await prisma.invoice.findUnique({ where: { id }, include: { user: true } });
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
    // Owner or admin only
    if (invoice.userId !== req.user!.id && req.user!.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Not authorized to view this invoice' });
    }

    const itemDescription = invoice.listingId
      ? 'Token Listing Package'
      : invoice.advertisementId
        ? 'Advertisement Package'
        : 'CoinBidex Invoice';

    const pdf = await renderInvoicePdf({
      invoiceNumber: invoice.invoiceNumber,
      issuedAt: invoice.createdAt,
      dueAt: invoice.dueAt,
      status: invoice.status,
      customerName: invoice.user.username,
      customerEmail: invoice.user.email,
      itemDescription,
      amount: Number(invoice.amount),
      currency: invoice.currency,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${invoice.invoiceNumber}.pdf"`);
    res.send(pdf);
  } catch (err) {
    logger.error('Invoice PDF error:', err);
    res.status(500).json({ success: false, message: 'Failed to generate invoice PDF' });
  }
};

// Creates a Stripe Checkout session for the invoice and returns the URL to
// redirect the user to. The invoice is marked PAID by the webhook, not
// here — this endpoint only starts the payment, never completes it.
export const createCheckoutSession = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
    if (invoice.userId !== req.user!.id) return res.status(403).json({ success: false, message: 'Not your invoice' });
    if (invoice.status !== 'PENDING') return res.status(400).json({ success: false, message: `Invoice is already ${invoice.status.toLowerCase()}` });

    if (!isStripeConfigured()) {
      return res.status(503).json({ success: false, message: 'Card payments are not configured yet — contact support to pay this invoice manually.' });
    }

    const frontendUrl = process.env.FRONTEND_URL || 'https://trade.coinbidex.com';
    const session = await createStripeCheckoutSession(
      invoice,
      `${frontendUrl}/billing/invoices/${invoice.id}?paid=1`,
      `${frontendUrl}/billing/invoices/${invoice.id}?cancelled=1`,
    );

    res.json({ success: true, data: { checkoutUrl: session.url } });
  } catch (err: any) {
    logger.error('Create checkout session error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to start checkout' });
  }
};

// Admin-only manual override — for bank transfers, comped invoices, or any
// payment that didn't come through Stripe. Goes through the exact same
// activation path as a real webhook, so behavior is identical either way.
export const markInvoicePaidManually = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
    if (invoice.status === 'PAID') return res.status(400).json({ success: false, message: 'Already paid' });

    await prisma.invoice.update({
      where: { id },
      data: { status: 'PAID', paidAt: new Date(), provider: 'MANUAL', notes },
    });

    await logAdminAction({
      adminId: req.user!.id,
      action: 'invoice.mark_paid_manually',
      entityType: 'Invoice',
      entityId: id,
      metadata: { notes },
    });

    await activatePromotion(id);

    res.json({ success: true, message: 'Invoice marked paid and promotion activated' });
  } catch (err) {
    logger.error('Manual mark-paid error:', err);
    res.status(500).json({ success: false, message: 'Failed to mark invoice paid' });
  }
};

export const getAllInvoicesAdmin = async (req: AuthRequest, res: Response) => {
  const { status, page = 1, limit = 30 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);
  const where: any = {};
  if (status) where.status = status;

  const [invoices, total] = await prisma.$transaction([
    prisma.invoice.findMany({
      where,
      include: { user: { select: { username: true, email: true } }, package: true },
      orderBy: { createdAt: 'desc' },
      skip, take: Number(limit),
    }),
    prisma.invoice.count({ where }),
  ]);

  res.json({ success: true, data: { invoices, pagination: { page: Number(page), limit: Number(limit), total } } });
};
