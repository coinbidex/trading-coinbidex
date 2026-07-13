import { Response } from 'express';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { AuthRequest } from '../middleware/auth';

export const submitListing = async (req: AuthRequest, res: Response) => {
  try {
    const {
      projectName, tokenSymbol, tokenName, description, website, whitepaper,
      github, twitter, telegram, discord, totalSupply, circulatingSupply,
      contractAddress, blockchain, auditReport
    } = req.body;

    const symbol = tokenSymbol.toUpperCase();

    // Check if already exists
    const existing = await prisma.listing.findFirst({
      where: { tokenSymbol: symbol }
    });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Token already submitted for listing' });
    }

    // Check or create asset
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

    const listingFee = 0.1; // 0.1 BTC listing fee

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
        listingFee: listingFee
      }
    });

    await prisma.notification.create({
      data: {
        userId: req.user!.id,
        type: 'LISTING_SUBMITTED',
        title: 'Listing Application Received',
        message: `Your listing application for ${tokenName} (${symbol}) has been received and is under review.`
      }
    });

    res.status(201).json({
      success: true,
      message: 'Listing application submitted successfully',
      data: { listing, listingFee: `${listingFee} BTC`, estimatedReviewTime: '3-5 business days' }
    });
  } catch (err) {
    logger.error('Submit listing error:', err);
    res.status(500).json({ success: false, message: 'Failed to submit listing' });
  }
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
        include: { asset: { select: { symbol: true, name: true, logoUrl: true } }, user: { select: { username: true, email: true } } },
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
      include: { asset: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: listings });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get your listings' });
  }
};

export const reviewListing = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, reviewNotes } = req.body;

    const listing = await prisma.listing.findUnique({ where: { id } });
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });

    const updated = await prisma.listing.update({
      where: { id },
      data: {
        status,
        reviewNotes,
        reviewedBy: req.user!.id,
        reviewedAt: new Date(),
        listedAt: status === 'LIVE' ? new Date() : undefined
      }
    });

    if (status === 'LIVE') {
      await prisma.asset.update({
        where: { id: listing.assetId },
        data: { isActive: true, isTradable: true }
      });
    }

    await prisma.notification.create({
      data: {
        userId: listing.userId,
        type: 'LISTING_UPDATE',
        title: `Listing ${status === 'LIVE' ? 'Approved!' : status === 'REJECTED' ? 'Rejected' : 'Updated'}`,
        message: reviewNotes || `Your listing for ${listing.tokenSymbol} has been ${status.toLowerCase()}`
      }
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    logger.error('Review listing error:', err);
    res.status(500).json({ success: false, message: 'Failed to review listing' });
  }
};
