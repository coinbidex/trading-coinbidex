import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';

// Called whenever an invoice transitions to PAID — whether that happened
// via the Stripe webhook or an admin manually marking it paid. Activates
// the associated listing/advertisement for exactly the package's duration,
// starting now. A separate cron (expiryService.ts) sweeps for anything
// past its activeUntil/endDate and deactivates it automatically.
export async function activatePromotion(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { package: true },
  });
  if (!invoice || invoice.status !== 'PAID') return;

  const activeUntil = new Date(Date.now() + invoice.package.durationHours * 60 * 60 * 1000);

  if (invoice.listingId) {
    await prisma.listing.update({
      where: { id: invoice.listingId },
      data: {
        status: 'LIVE',
        feePaid: true,
        listedAt: new Date(),
        activeUntil,
      },
    });
    // Flip the underlying asset live so it actually shows up in markets.
    const listing = await prisma.listing.findUnique({ where: { id: invoice.listingId } });
    if (listing) {
      await prisma.asset.update({
        where: { id: listing.assetId },
        data: { isActive: true, isTradable: true },
      }).catch(() => {});
    }
    logger.info(`Listing ${invoice.listingId} activated until ${activeUntil.toISOString()}`);
  }

  if (invoice.advertisementId) {
    await prisma.advertisement.update({
      where: { id: invoice.advertisementId },
      data: {
        status: 'ACTIVE',
        startDate: new Date(),
        endDate: activeUntil,
      },
    });
    logger.info(`Advertisement ${invoice.advertisementId} activated until ${activeUntil.toISOString()}`);
  }
}
