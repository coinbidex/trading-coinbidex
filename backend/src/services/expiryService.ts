import cron from 'node-cron';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';

// Runs every 15 minutes: finds any listing/advertisement whose paid-for
// window has ended and deactivates it. This is what makes "1 week featured
// listing" actually mean one week — without this, anything ever activated
// stays live forever.
async function sweepExpiredPromotions() {
  const now = new Date();

  const expiredListings = await prisma.listing.updateMany({
    where: { status: 'LIVE', activeUntil: { lt: now } },
    data: { status: 'EXPIRED' },
  });
  if (expiredListings.count > 0) {
    logger.info(`Expiry sweep: ${expiredListings.count} listing(s) expired`);
    // Also pull the underlying assets back out of active trading
    const stale = await prisma.listing.findMany({
      where: { status: 'EXPIRED', activeUntil: { lt: now } },
      select: { assetId: true },
    });
    for (const { assetId } of stale) {
      await prisma.asset.update({ where: { id: assetId }, data: { isActive: false } }).catch(() => {});
    }
  }

  const expiredAds = await prisma.advertisement.updateMany({
    where: { status: 'ACTIVE', endDate: { lt: now } },
    data: { status: 'EXPIRED' },
  });
  if (expiredAds.count > 0) {
    logger.info(`Expiry sweep: ${expiredAds.count} advertisement(s) expired`);
  }
}

export function startExpiryService() {
  // Run once at boot too, in case anything expired while the service was down
  sweepExpiredPromotions().catch(err => logger.error('Expiry sweep failed:', err));
  cron.schedule('*/15 * * * *', () => {
    sweepExpiredPromotions().catch(err => logger.error('Expiry sweep failed:', err));
  });
  logger.info('✅ Promotion expiry sweep scheduled (every 15 min)');
}
