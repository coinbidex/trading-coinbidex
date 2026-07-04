import { Response } from 'express';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { AuthRequest } from '../middleware/auth';

export const getDashboardStats = async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 86400000);
    const lastWeek = new Date(now.getTime() - 7 * 86400000);

    const [
      totalUsers, newUsers24h, totalVolume, trades24h,
      pendingListings, activeAds, pendingWithdrawals, totalRevenue
    ] = await prisma.$transaction([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: yesterday } } }),
      prisma.trade.aggregate({ _sum: { quoteQuantity: true } }),
      prisma.trade.count({ where: { createdAt: { gte: yesterday } } }),
      prisma.listing.count({ where: { status: 'PENDING' } }),
      prisma.advertisement.count({ where: { status: 'ACTIVE' } }),
      prisma.transaction.count({ where: { type: 'WITHDRAWAL', status: 'PROCESSING' } }),
      prisma.transaction.aggregate({
        where: { type: 'FEE', status: 'COMPLETED' },
        _sum: { amount: true }
      })
    ]);

    res.json({
      success: true,
      data: {
        users: { total: totalUsers, new24h: newUsers24h },
        trading: { totalVolume: totalVolume._sum.quoteQuantity || 0, trades24h },
        listings: { pending: pendingListings },
        ads: { active: activeAds },
        withdrawals: { pending: pendingWithdrawals },
        revenue: { total: totalRevenue._sum.amount || 0 }
      }
    });
  } catch (err) {
    logger.error('Admin dashboard error:', err);
    res.status(500).json({ success: false, message: 'Failed to get dashboard stats' });
  }
};

export const getUsers = async (req: AuthRequest, res: Response) => {
  try {
    const { search, status, role, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const where: any = {};
    if (status) where.status = status;
    if (role) where.role = role;
    if (search) {
      where.OR = [
        { email: { contains: search as string, mode: 'insensitive' } },
        { username: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        select: {
          id: true, email: true, username: true, role: true, status: true,
          kycStatus: true, createdAt: true, lastLoginAt: true
        },
        orderBy: { createdAt: 'desc' },
        skip, take: Number(limit)
      }),
      prisma.user.count({ where })
    ]);

    res.json({ success: true, data: { users, pagination: { page: Number(page), limit: Number(limit), total } } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get users' });
  }
};

export const updateUserStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, role } = req.body;

    const user = await prisma.user.update({
      where: { id },
      data: { ...(status && { status }), ...(role && { role }) }
    });

    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update user' });
  }
};

export const manageMarket = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { isActive, makerFee, takerFee, minOrderSize, maxOrderSize } = req.body;

    const market = await prisma.market.update({
      where: { id },
      data: {
        ...(isActive !== undefined && { isActive }),
        ...(makerFee && { makerFee }),
        ...(takerFee && { takerFee }),
        ...(minOrderSize && { minOrderSize }),
        ...(maxOrderSize && { maxOrderSize })
      }
    });

    res.json({ success: true, data: market });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update market' });
  }
};

export const createMarket = async (req: AuthRequest, res: Response) => {
  try {
    const { baseSymbol, quoteSymbol, makerFee, takerFee, minOrderSize, maxOrderSize } = req.body;

    const baseAsset = await prisma.asset.findUnique({ where: { symbol: baseSymbol.toUpperCase() } });
    const quoteAsset = await prisma.asset.findUnique({ where: { symbol: quoteSymbol.toUpperCase() } });

    if (!baseAsset || !quoteAsset) {
      return res.status(404).json({ success: false, message: 'Asset not found' });
    }

    const market = await prisma.market.create({
      data: {
        symbol: `${baseSymbol.toUpperCase()}${quoteSymbol.toUpperCase()}`,
        baseAssetId: baseAsset.id,
        quoteAssetId: quoteAsset.id,
        makerFee: makerFee || 0.001,
        takerFee: takerFee || 0.001,
        minOrderSize: minOrderSize || 0.00001,
        maxOrderSize: maxOrderSize || 1000000
      }
    });

    res.status(201).json({ success: true, data: market });
  } catch (err) {
    logger.error('Create market error:', err);
    res.status(500).json({ success: false, message: 'Failed to create market' });
  }
};

export const getPendingWithdrawals = async (req: AuthRequest, res: Response) => {
  try {
    const txs = await prisma.transaction.findMany({
      where: { type: 'WITHDRAWAL', status: 'PROCESSING' },
      include: { user: { select: { email: true, username: true } } },
      orderBy: { createdAt: 'asc' }
    });
    res.json({ success: true, data: txs });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get withdrawals' });
  }
};

export const processWithdrawal = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, txHash } = req.body;

    const tx = await prisma.transaction.update({
      where: { id },
      data: { status, txHash, processedAt: new Date() }
    });

    await prisma.notification.create({
      data: {
        userId: tx.userId,
        type: 'WITHDRAWAL_UPDATE',
        title: `Withdrawal ${status === 'COMPLETED' ? 'Completed' : 'Failed'}`,
        message: `Your withdrawal of ${tx.amount} ${tx.asset} has been ${status.toLowerCase()}`,
        data: { txHash }
      }
    });

    res.json({ success: true, data: tx });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to process withdrawal' });
  }
};
