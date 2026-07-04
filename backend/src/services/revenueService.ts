import { prisma } from '../utils/prisma';
import { cache } from '../utils/redis';
import { logger } from '../utils/logger';

export type RevenueSource = 'SWAP_MARKUP' | 'BROKER_REBATE' | 'LISTING_FEE' | 'AD_SPEND' | 'MOONPAY_REFERRAL' | 'SUBSCRIPTION';

export async function recordRevenue(
  source: RevenueSource,
  amount: number,
  currency: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    await prisma.transaction.create({
      data: {
        userId: 'PLATFORM', // platform income, not user
        type: 'FEE',
        status: 'COMPLETED',
        asset: currency,
        amount,
        fee: 0,
        netAmount: amount,
        description: `Revenue: ${source}`,
        processedAt: new Date(),
        metadata: metadata || {},
      }
    });

    // Bust revenue cache
    await cache.del('platform:revenue:summary');
    logger.info(`Revenue recorded: ${source} ${amount} ${currency}`);
  } catch (err: any) {
    logger.error(`Failed to record revenue: ${err.message}`);
  }
}

export async function getRevenueSummary(): Promise<any> {
  const cached = await cache.get('platform:revenue:summary');
  if (cached) return cached;

  const now        = new Date();
  const today      = new Date(now.setHours(0, 0, 0, 0));
  const thisMonth  = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalAll, totalMonth, totalToday, bySource] = await prisma.$transaction([
    prisma.transaction.aggregate({
      where: { type: 'FEE', status: 'COMPLETED' },
      _sum: { amount: true }
    }),
    prisma.transaction.aggregate({
      where: { type: 'FEE', status: 'COMPLETED', createdAt: { gte: thisMonth } },
      _sum: { amount: true }
    }),
    prisma.transaction.aggregate({
      where: { type: 'FEE', status: 'COMPLETED', createdAt: { gte: today } },
      _sum: { amount: true }
    }),
    prisma.transaction.groupBy({
      by: ['description'],
      where: { type: 'FEE', status: 'COMPLETED' },
      _sum: { amount: true },
      _count: true,
      orderBy: { _sum: { amount: 'desc' } },
    })
  ]);

  const summary = {
    total:   parseFloat(totalAll._sum.amount?.toString()   || '0'),
    month:   parseFloat(totalMonth._sum.amount?.toString() || '0'),
    today:   parseFloat(totalToday._sum.amount?.toString() || '0'),
    bySource: bySource.map(r => ({
      source: r.description?.replace('Revenue: ', ''),
      total:  parseFloat(r._sum?.amount?.toString() || '0'),
      count:  r._count,
    }))
  };

  await cache.set('platform:revenue:summary', summary, 300);
  return summary;
}
