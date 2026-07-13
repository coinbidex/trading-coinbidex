import { Response } from 'express';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { AuthRequest } from '../middleware/auth';
import { Decimal } from '@prisma/client/runtime/library';

export const createAd = async (req: AuthRequest, res: Response) => {
  try {
    const { type, title, description, imageUrl, targetUrl, budget, cpc, cpm, targetCountries, targetAssets, startDate, endDate } = req.body;

    const ad = await prisma.advertisement.create({
      data: {
        userId: req.user!.id,
        type,
        title,
        description,
        imageUrl,
        targetUrl,
        budget: new Decimal(budget),
        cpc: cpc ? new Decimal(cpc) : undefined,
        cpm: cpm ? new Decimal(cpm) : undefined,
        targetCountries: targetCountries || [],
        targetAssets: targetAssets || [],
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        status: 'PENDING_REVIEW'
      }
    });

    res.status(201).json({ success: true, data: ad });
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

    // Increment impressions
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
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: ads });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get ads' });
  }
};

export const reviewAd = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, reviewNotes } = req.body;

    const ad = await prisma.advertisement.update({
      where: { id },
      data: { status, reviewNotes, reviewedAt: new Date() }
    });

    res.json({ success: true, data: ad });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to review ad' });
  }
};

export const getAdPricing = async (req: AuthRequest, res: Response) => {
  res.json({
    success: true,
    data: {
      packages: [
        { type: 'BANNER', name: 'Banner Ad', description: 'Top banner placement on trading pages', cpm: 5, minBudget: 50, formats: ['728x90', '300x250', '160x600'] },
        { type: 'SPONSORED_LISTING', name: 'Sponsored Listing', description: 'Featured coin listing in market overview', cpc: 0.5, minBudget: 100, duration: '30 days' },
        { type: 'PUSH_NOTIFICATION', name: 'Push Notification', description: 'Direct push to opted-in users', cpc: 1.0, minBudget: 200, reach: '50k+ users' },
        { type: 'EMAIL_BLAST', name: 'Email Campaign', description: 'Targeted email to verified traders', cpm: 20, minBudget: 500, reach: '100k+ subscribers' }
      ],
      targeting: ['Country/Region', 'Trading pairs', 'User segment', 'Device type']
    }
  });
};
