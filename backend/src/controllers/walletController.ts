import { Response } from 'express';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { AuthRequest } from '../middleware/auth';
import { Decimal } from '@prisma/client/runtime/library';

export const getWallets = async (req: AuthRequest, res: Response) => {
  try {
    const wallets = await prisma.wallet.findMany({
      where: { userId: req.user!.id },
      include: { asset: { select: { symbol: true, name: true, logoUrl: true, decimals: true } } },
      orderBy: { balance: 'desc' }
    });
    res.json({ success: true, data: wallets });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get wallets' });
  }
};

export const getWalletBalance = async (req: AuthRequest, res: Response) => {
  try {
    const { symbol } = req.params;
    const asset = await prisma.asset.findUnique({ where: { symbol: symbol.toUpperCase() } });
    if (!asset) return res.status(404).json({ success: false, message: 'Asset not found' });

    const wallet = await prisma.wallet.findUnique({
      where: { userId_assetId: { userId: req.user!.id, assetId: asset.id } },
      include: { asset: true }
    });

    res.json({ success: true, data: wallet || { balance: '0', lockedBalance: '0', asset } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get balance' });
  }
};

export const deposit = async (req: AuthRequest, res: Response) => {
  try {
    const { symbol, amount, txHash, network } = req.body;
    const userId = req.user!.id;

    const asset = await prisma.asset.findUnique({ where: { symbol: symbol.toUpperCase() } });
    if (!asset) return res.status(404).json({ success: false, message: 'Asset not found' });

    const depositAmount = new Decimal(amount);
    const fee = depositAmount.mul(asset.depositFee);
    const netAmount = depositAmount.sub(fee);

    const result = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.upsert({
        where: { userId_assetId: { userId, assetId: asset.id } },
        create: { userId, assetId: asset.id, balance: netAmount, totalDeposited: depositAmount },
        update: {
          balance: { increment: netAmount },
          totalDeposited: { increment: depositAmount }
        }
      });

      const txRecord = await tx.transaction.create({
        data: {
          userId,
          type: 'DEPOSIT',
          status: 'COMPLETED',
          asset: asset.symbol,
          amount: depositAmount,
          fee,
          netAmount,
          txHash: txHash || undefined,
          network: network || undefined,
          description: `Deposit ${amount} ${asset.symbol}`,
          processedAt: new Date()
        }
      });

      return { wallet, transaction: txRecord };
    });

    const io = req.app.get('io');
    io?.to(`user:${userId}`).emit('wallet:deposit', { symbol, amount: netAmount.toString() });

    res.json({ success: true, message: 'Deposit successful', data: result });
  } catch (err) {
    logger.error('Deposit error:', err);
    res.status(500).json({ success: false, message: 'Deposit failed' });
  }
};

export const withdraw = async (req: AuthRequest, res: Response) => {
  try {
    const { symbol, amount, address, network, memo } = req.body;
    const userId = req.user!.id;

    // Check KYC
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user?.kycStatus !== 'APPROVED') {
      return res.status(403).json({ success: false, message: 'KYC approval required for withdrawals' });
    }

    const asset = await prisma.asset.findUnique({ where: { symbol: symbol.toUpperCase() } });
    if (!asset) return res.status(404).json({ success: false, message: 'Asset not found' });
    if (!asset.isWithdrawable) return res.status(400).json({ success: false, message: 'Asset not withdrawable' });

    const withdrawAmount = new Decimal(amount);
    if (withdrawAmount.lt(asset.minWithdraw)) {
      return res.status(400).json({ success: false, message: `Minimum withdrawal: ${asset.minWithdraw} ${symbol}` });
    }

    const fee = asset.withdrawFee;
    const netAmount = withdrawAmount.sub(fee);

    const wallet = await prisma.wallet.findUnique({
      where: { userId_assetId: { userId, assetId: asset.id } }
    });

    const available = wallet ? wallet.balance.sub(wallet.lockedBalance) : new Decimal(0);
    if (available.lt(withdrawAmount)) {
      return res.status(400).json({ success: false, message: 'Insufficient balance' });
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { userId_assetId: { userId, assetId: asset.id } },
        data: {
          balance: { decrement: withdrawAmount },
          totalWithdrawn: { increment: withdrawAmount }
        }
      });

      return tx.transaction.create({
        data: {
          userId,
          type: 'WITHDRAWAL',
          status: 'PROCESSING',
          asset: asset.symbol,
          amount: withdrawAmount,
          fee,
          netAmount,
          address,
          network: network || undefined,
          memo: memo || undefined,
          description: `Withdrawal ${amount} ${asset.symbol} to ${address}`
        }
      });
    });

    res.json({ success: true, message: 'Withdrawal initiated', data: result });
  } catch (err) {
    logger.error('Withdraw error:', err);
    res.status(500).json({ success: false, message: 'Withdrawal failed' });
  }
};

export const getPortfolioSummary = async (req: AuthRequest, res: Response) => {
  try {
    const wallets = await prisma.wallet.findMany({
      where: { userId: req.user!.id, balance: { gt: 0 } },
      include: { asset: true }
    });

    // Would use real prices in production
    res.json({ success: true, data: { wallets, totalValueUsd: '0' } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get portfolio' });
  }
};
