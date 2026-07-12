import { Response } from 'express';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { AuthRequest } from '../middleware/auth';
import { createInvoice } from '../services/invoiceService';
import { logAdminAction } from '../services/auditLogService';

export const createAd = async (req: AuthRequest, res: Response) => {
  try {
    const { type, title, description, imageUrl, targetUrl, targetCountries, targetAssets, packageId } = req.body;

    if (!packageId) {
      return res.status(400).json({ success: false, message: 'packageId is required — see GET /api/v1/advertisements/pricing' });
    }
    const pkg = await prisma.promoPackage.findUnique({ where: { id: packageId } });
    if (!pkg || pkg.type !== 'ADVERTISEMENT' || !pkg.isActive) {
      return res.status(400).json({ success: false, message: 'Invalid or inactive advertisement package' });
    }

    const ad = await prisma.advertisement.create({
      data: {
        userId: req.user!.id,
        type,
        title,
        description,
        imageUrl,
        targetUrl,
        targetCountries: targetCountries || [],
        targetAssets: targetAssets || [],
        packageId: pkg.id,
        status: 'PENDING_REVIEW'
      }
    });

    res.status(201).json({ success: true, data: { ad, package: pkg } });
  } catch (err) {
    logger.error('Create ad error:', err);
    res.status(500).json({ success: false, message: 'Failed to create advertisement' });
  }
};

export const getActiveAds = async (req: AuthRequest, res: Response) => {
  try {
    const { type, asset } = req.query;
    const now = new Date();

    const where: any = {
      status: 'ACTIVE',
      OR: [{ startDate: null }, { startDate: { lte: now } }],
      AND: [{ OR: [{ endDate: null }, { endDate: { gte: now } }] }]
    };
    if (type) where.type = type;

    const ads = await prisma.advertisement.findMany({
      where,
      select: { id: true, type: true, title: true, description: true, imageUrl: true, targetUrl: true, impressions: true, clicks: true },
      take: 10
    });

    if (ads.length > 0) {
      await prisma.advertisement.updateMany({
        where: { id: { in: ads.map(a => a.id) } },
        data: { impressions: { increment: 1 } }
      });
    }

    res.json({ success: true, data: ads });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get ads' });
  }
};

export const trackAdClick = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const ad = await prisma.advertisement.findUnique({ where: { id } });
    if (!ad) return res.status(404).json({ success: false, message: 'Ad not found' });

    await prisma.advertisement.update({
      where: { id },
      data: {
        clicks: { increment: 1 },
        spent: ad.cpc ? { increment: ad.cpc } : undefined
      }
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to track click' });
  }
};

export const getMyAds = async (req: AuthRequest, res: Response) => {
  try {
    const ads = await prisma.advertisement.findMany({
      where: { userId: req.user!.id },
      include: { package: true, invoices: { orderBy: { createdAt: 'desc' } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: ads });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get ads' });
  }
};

// Admin review. Approving generates an invoice — the ad only goes ACTIVE
// once that invoice is paid (see promoActivationService.ts).
export const reviewAd = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, reviewNotes } = req.body;

    const ad = await prisma.advertisement.findUnique({ where: { id } });
    if (!ad) return res.status(404).json({ success: false, message: 'Advertisement not found' });

    const updated = await prisma.advertisement.update({
      where: { id },
      data: { status, reviewNotes, reviewedAt: new Date() }
    });

    await logAdminAction({
      adminId: req.user!.id,
      action: `advertisement.${status.toLowerCase()}`,
      entityType: 'Advertisement',
      entityId: id,
      metadata: { reviewNotes },
    });

    let invoice = null;
    if (status === 'APPROVED' && ad.packageId) {
      const pkg = await prisma.promoPackage.findUnique({ where: { id: ad.packageId } });
      if (pkg) {
        invoice = await createInvoice({
          userId: ad.userId,
          packageId: pkg.id,
          amount: Number(pkg.price),
          advertisementId: ad.id,
        });
        await prisma.notification.create({
          data: {
            userId: ad.userId,
            type: 'AD_UPDATE',
            title: 'Ad Approved — Invoice Ready',
            message: `Your ad "${ad.title}" was approved! Pay invoice ${invoice.invoiceNumber} to go live.`
          }
        }).catch(() => {});
      }
    } else if (status === 'REJECTED') {
      await prisma.notification.create({
        data: {
          userId: ad.userId,
          type: 'AD_UPDATE',
          title: 'Ad Rejected',
          message: reviewNotes || `Your ad "${ad.title}" was rejected.`
        }
      }).catch(() => {});
    }

    res.json({ success: true, data: { advertisement: updated, invoice } });
  } catch (err) {
    logger.error('Review ad error:', err);
    res.status(500).json({ success: false, message: 'Failed to review ad' });
  }
};

export const getAdPricing = async (_req: AuthRequest, res: Response) => {
  const packages = await prisma.promoPackage.findMany({
    where: { type: 'ADVERTISEMENT', isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
  res.json({
    success: true,
    data: {
      packages,
      targeting: ['Country/Region', 'Trading pairs', 'User segment', 'Device type']
    }
  });
};
