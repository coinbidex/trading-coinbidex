import { Response } from 'express'
import { Decimal } from '@prisma/client/runtime/library'
import { prisma } from '../utils/prisma'
import { logger } from '../utils/logger'
import { AuthRequest } from '../middleware/auth'
import { getOneInchQuote, buildSwapTransaction, getSupportedTokens } from '../services/oneInchService'
import { recordRevenue } from '../services/revenueService'
import { getSwapRoute, getRouteStatus } from '../services/routingService'
import { platformConfig } from '../services/platformMode'

// ── Get quote ─────────────────────────────────────────────────
export const getSwapQuote = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { fromAsset, toAsset, fromAmount, chainId = '1' } = req.query

    if (!fromAsset || !toAsset || !fromAmount) {
      res.status(400).json({ success: false, message: 'fromAsset, toAsset and fromAmount are required' })
      return
    }

    const amount = parseFloat(fromAmount as string)
    if (isNaN(amount) || amount <= 0) {
      res.status(400).json({ success: false, message: 'fromAmount must be a positive number' })
      return
    }

    const quote = await getOneInchQuote(
      fromAsset as string,
      toAsset as string,
      amount,
      parseInt(chainId as string)
    )

    res.json({
      success: true,
      data: {
        ...quote,
        mode:       platformConfig.mode,
        routeLabel: quote.isReal ? 'Best DEX rate via 1inch' : 'Market rate estimate',
      }
    })
  } catch (err: any) {
    logger.error('Swap quote error:', err)
    res.status(500).json({ success: false, message: err.message || 'Failed to get swap quote' })
  }
}

// ── Execute swap (internal balances — used in demo) ───────────
export const executeSwap = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { fromAsset, toAsset, fromAmount, slippage = 0.5 } = req.body
    const userId = req.user!.id

    if (!fromAsset || !toAsset || !fromAmount) {
      res.status(400).json({ success: false, message: 'fromAsset, toAsset and fromAmount are required' })
      return
    }

    const from   = String(fromAsset).toUpperCase()
    const to     = String(toAsset).toUpperCase()
    const amount = new Decimal(fromAmount)

    if (amount.lte(0)) {
      res.status(400).json({ success: false, message: 'Amount must be greater than 0' })
      return
    }

    const quote = await getOneInchQuote(from, to, parseFloat(fromAmount))

    const [fromAssetRecord, toAssetRecord] = await Promise.all([
      prisma.asset.findUnique({ where: { symbol: from } }),
      prisma.asset.findUnique({ where: { symbol: to } }),
    ])

    if (!fromAssetRecord || !toAssetRecord) {
      res.status(404).json({ success: false, message: `Asset not found: ${!fromAssetRecord ? from : to}` })
      return
    }

    const wallet = await prisma.wallet.findUnique({
      where: { userId_assetId: { userId, assetId: fromAssetRecord.id } }
    })

    const available = wallet
      ? new Decimal(wallet.balance.toString()).sub(new Decimal(wallet.lockedBalance.toString()))
      : new Decimal(0)

    if (available.lt(amount)) {
      res.status(400).json({
        success: false,
        message: `Insufficient ${from} balance`,
        data: { available: available.toFixed(8), required: amount.toFixed(8) }
      })
      return
    }

    const toAmount   = new Decimal(quote.toAmount)
    const fee        = new Decimal(String(quote.fee))
    const activeRoute = getSwapRoute()

    const swap = await prisma.$transaction(async tx => {
      await tx.wallet.update({
        where: { userId_assetId: { userId, assetId: fromAssetRecord.id } },
        data: { balance: { decrement: amount } }
      })

      await tx.wallet.upsert({
        where:  { userId_assetId: { userId, assetId: toAssetRecord.id } },
        create: { userId, assetId: toAssetRecord.id, balance: toAmount },
        update: { balance: { increment: toAmount } },
      })

      const swapRecord = await tx.swap.create({
        data: {
          userId,
          fromAsset:    from,
          toAsset:      to,
          fromAmount:   amount,
          toAmount,
          exchangeRate: new Decimal(String(quote.exchangeRate)),
          fee,
          feeAsset:     to,
          status:       'COMPLETED',
          slippage:     new Decimal(String(slippage)),
          completedAt:  new Date(),
        }
      })

      await tx.transaction.create({
        data: {
          userId,
          type:        'SWAP',
          status:      'COMPLETED',
          asset:       from,
          amount:      amount.neg(),
          fee,
          netAmount:   amount.neg().sub(fee),
          description: `Swap ${fromAmount} ${from} → ${toAmount.toFixed(6)} ${to}`,
          processedAt: new Date(),
        }
      })

      return swapRecord
    })

    // Record revenue (live only)
    if (platformConfig.recordRevenue) {
      const markupUsd = fee.toNumber() * (to === 'USDT' ? 1 : parseFloat(String(quote.exchangeRate)))
      await recordRevenue('SWAP_MARKUP', markupUsd, 'USD', {
        swapId: swap.id, fromAsset: from, toAsset: to, route: activeRoute
      }).catch(err => logger.error('Revenue record failed:', err))
    }

    // WebSocket notification
    const io = req.app.get('io')
    io?.to(`user:${userId}`).emit('swap:completed', {
      fromAsset: from, toAsset: to, fromAmount, toAmount: quote.toAmount,
    })

    res.json({
      success: true,
      data: {
        swap,
        fromAmount,
        toAmount:  quote.toAmount,
        rate:      quote.exchangeRate,
        route:     quote.isReal ? 'Best DEX rate' : 'Market rate',
      }
    })
  } catch (err: any) {
    logger.error('Execute swap error:', err)
    res.status(500).json({ success: false, message: err.message || 'Swap execution failed' })
  }
}

// ── Build on-chain tx (live — user signs in MetaMask) ─────────
export const buildOnChainSwap = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { fromAsset, toAsset, fromAmount, walletAddress, slippage = 0.5, chainId = 1 } = req.body

    if (!walletAddress) {
      res.status(400).json({ success: false, message: 'walletAddress is required for on-chain swap' })
      return
    }

    if (!fromAsset || !toAsset || !fromAmount) {
      res.status(400).json({ success: false, message: 'fromAsset, toAsset and fromAmount are required' })
      return
    }

    const txData = await buildSwapTransaction(
      fromAsset, toAsset, parseFloat(fromAmount),
      walletAddress, slippage, chainId
    )

    res.json({ success: true, data: { tx: txData } })
    } catch (err: any) {
        logger.error('Build on-chain swap error:', err)
        const errorMessage = err?.response?.data?.description 
            || err?.response?.data?.message 
            || err?.message 
            || 'Failed to build swap transaction'
        
        res.status(500).json({ success: false, message: errorMessage })
    }
}

// ── Swap history ──────────────────────────────────────────────
export const getSwapHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page  = Math.max(1, parseInt(req.query.page as string) || 1)
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20)
    const skip  = (page - 1) * limit

    const [swaps, total] = await prisma.$transaction([
      prisma.swap.findMany({
        where:   { userId: req.user!.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.swap.count({ where: { userId: req.user!.id } })
    ])

    res.json({
      success: true,
      data: { swaps, pagination: { page, limit, total, pages: Math.ceil(total / limit) } }
    })
  } catch (err) {
    logger.error('Swap history error:', err)
    res.status(500).json({ success: false, message: 'Failed to get swap history' })
  }
}

// ── Supported tokens ──────────────────────────────────────────
export const getSupportedSwapTokens = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const chainId = parseInt(req.query.chainId as string) || 1
    const tokens  = await getSupportedTokens(chainId)
    res.json({ success: true, data: tokens })
  } catch (err) {
    logger.error('Supported tokens error:', err)
    res.status(500).json({ success: false, message: 'Failed to get supported tokens' })
  }
}

// ── Routing status (admin) ────────────────────────────────────
export const getRoutingStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const status = getRouteStatus()
    res.json({ success: true, data: { ...status, platformMode: platformConfig.mode } })
  } catch (err) {
    logger.error('Routing status error:', err)
    res.status(500).json({ success: false, message: 'Failed to get routing status' })
  }
}
