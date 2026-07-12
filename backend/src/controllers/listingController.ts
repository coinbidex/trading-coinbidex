import { Response } from 'express';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { AuthRequest } from '../middleware/auth';
import { createInvoice } from '../services/invoiceService';
import { logAdminAction } from '../services/auditLogService';

export const submitListing = async (req: AuthRequest, res: Response) => {
  try {
    const {
      projectName, tokenSymbol, tokenName, description, website, whitepaper,
      github, twitter, telegram, discord, totalSupply, circulatingSupply,
      contractAddress, blockchain, auditReport, packageId
    } = req.body;

    if (!packageId) {
      return res.status(400).json({ success: false, message: 'packageId is required — see GET /api/v1/promo/packages?type=LISTING' });
    }
    const pkg = await prisma.promoPackage.findUnique({ where: { id: packageId } });
    if (!pkg || pkg.type !== 'LISTING' || !pkg.isActive) {
      return res.status(400).json({ success: false, message: 'Invalid or inactive listing package' });
    }

    const symbol = tokenSymbol.toUpperCase();

    const existing = await prisma.listing.findFirst({ where: { tokenSymbol: symbol } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Token already submitted for listing' });
    }

    let asset = await prisma.asset.findUnique({ where: { symbol } });
    if (!asset) {
      asset = await prisma.asset.create({
        data: {
          symbol,
          name: tokenName,
          slug: symbol.toLowerCase(),
          description,
          website,
          whitepaper,
          contractAddress,
          blockchain,
          isActive: false,
          isTradable: false
        }
      });
    }

    const listing = await prisma.listing.create({
      data: {
        userId: req.user!.id,
        assetId: asset.id,
        status: 'PENDING',
        projectName,
        tokenSymbol: symbol,
        tokenName,
        description,
        website,
        whitepaper: whitepaper || '',
        github,
        twitter,
        telegram,
        discord,
        totalSupply,
        circulatingSupply,
        contractAddress,
        blockchain,
        auditReport,
        listingFee: pkg.price,
        packageId: pkg.id,
      }
    });

    await prisma.notification.create({
      data: {
        userId: req.user!.id,
        type: 'LISTING_SUBMITTED',
        title: 'Listing Application Received',
        message: `Your listing application for ${tokenName} (${symbol}) has been received and is under review. No payment is required yet — we'll invoice you once it's approved.`
      }
    });

    res.status(201).json({
      success: true,
      message: 'Listing application submitted successfully',
      data: { listing, package: pkg, estimatedReviewTime: '3-5 business days' }
    });
  } catch (err) {
    logger.error('Submit listing error:', err);
    res.status(500).json({ success: false, message: 'Failed to submit listing' });
  }
};

export const getListingPricing = async (_req: AuthRequest, res: Response) => {
  const packages = await prisma.promoPackage.findMany({
    where: { type: 'LISTING', isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
  res.json({ success: true, data: packages });
};

export const getListings = async (req: AuthRequest, res: Response) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const where: any = {};
    if (status) where.status = status;

    const [listings, total] = await prisma.$transaction([
      prisma.listing.findMany({
        where,
        include: { asset: { select: { symbol: true, name: true, logoUrl: true } }, user: { select: { username: true, email: true } }, package: true },
        orderBy: { createdAt: 'desc' },
        skip, take: Number(limit)
      }),
      prisma.listing.count({ where })
    ]);

    res.json({ success: true, data: { listings, pagination: { page: Number(page), limit: Number(limit), total } } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get listings' });
  }
};

export const getMyListings = async (req: AuthRequest, res: Response) => {
  try {
    const listings = await prisma.listing.findMany({
      where: { userId: req.user!.id },
      include: { asset: true, package: true, invoices: { orderBy: { createdAt: 'desc' } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: listings });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get your listings' });
  }
};

// Admin review. Approving no longer takes the listing live directly — it
// generates an invoice and the listing goes LIVE automatically once that
// invoice is paid (see promoActivationService.ts, triggered by either the
// Stripe webhook or an admin manually marking the invoice paid).
export const reviewListing = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, reviewNotes } = req.body;

    const listing = await prisma.listing.findUnique({ where: { id } });
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });

    const updated = await prisma.listing.update({
      where: { id },
      data: { status, reviewNotes, reviewedBy: req.user!.id, reviewedAt: new Date() }
    });

    await logAdminAction({
      adminId: req.user!.id,
      action: `listing.${status.toLowerCase()}`,
      entityType: 'Listing',
      entityId: id,
      metadata: { reviewNotes },
    });

    let invoice = null;
    if (status === 'APPROVED') {
      invoice = await createInvoice({
        userId: listing.userId,
        packageId: listing.packageId!,
        amount: Number(listing.listingFee),
        listingId: listing.id,
      });
      await prisma.notification.create({
        data: {
          userId: listing.userId,
          type: 'LISTING_UPDATE',
          title: 'Listing Approved — Invoice Ready',
          message: `Your listing for ${listing.tokenSymbol} was approved! Pay invoice ${invoice.invoiceNumber} to go live.`
        }
      });
    } else if (status === 'REJECTED') {
      await prisma.notification.create({
        data: {
          userId: listing.userId,
          type: 'LISTING_UPDATE',
          title: 'Listing Rejected',
          message: reviewNotes || `Your listing for ${listing.tokenSymbol} was rejected.`
        }
      });
    }

    res.json({ success: true, data: { listing: updated, invoice } });
  } catch (err) {
    logger.error('Review listing error:', err);
    res.status(500).json({ success: false, message: 'Failed to review listing' });
  }
};
