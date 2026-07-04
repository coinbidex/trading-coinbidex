import { Response } from 'express';
import { prisma } from '../utils/prisma';
import { cache } from '../utils/redis';
import { logger } from '../utils/logger';
import { AuthRequest } from '../middleware/auth';
import { Decimal } from '@prisma/client/runtime/library';

export const createOrder = async (req: AuthRequest, res: Response) => {
  try {
    const { marketSymbol, side, type, price, quantity, stopPrice, clientOrderId } = req.body;
    const userId = req.user!.id;

    // Get market
    const market = await prisma.market.findUnique({
      where: { symbol: marketSymbol.toUpperCase() },
      include: { baseAsset: true, quoteAsset: true }
    });
    if (!market || !market.isActive) {
      return res.status(404).json({ success: false, message: 'Market not found or inactive' });
    }

    // Validate quantity
    const qty = new Decimal(quantity);
    if (qty.lt(market.minOrderSize) || qty.gt(market.maxOrderSize)) {
      return res.status(400).json({
        success: false,
        message: `Quantity must be between ${market.minOrderSize} and ${market.maxOrderSize}`
      });
    }

    // Determine required asset and amount
    let requiredAssetId: string;
    let requiredAmount: Decimal;

    if (side === 'BUY') {
      requiredAssetId = market.quoteAssetId;
      const orderPrice = type === 'MARKET' ? (market.lastPrice || new Decimal(0)) : new Decimal(price);
      requiredAmount = qty.mul(orderPrice).mul(new Decimal(1).add(market.takerFee));
    } else {
      requiredAssetId = market.baseAssetId;
      requiredAmount = qty;
    }

    // Check balance
    const wallet = await prisma.wallet.findUnique({
      where: { userId_assetId: { userId, assetId: requiredAssetId } }
    });

    const availableBalance = wallet ? wallet.balance.sub(wallet.lockedBalance) : new Decimal(0);
    if (availableBalance.lt(requiredAmount)) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance',
        data: { available: availableBalance.toString(), required: requiredAmount.toString() }
      });
    }

    // Lock funds
    await prisma.wallet.update({
      where: { userId_assetId: { userId, assetId: requiredAssetId } },
      data: { lockedBalance: { increment: requiredAmount } }
    });

    const fee = type === 'MARKET'
      ? qty.mul(market.takerFee)
      : qty.mul(market.makerFee);

    const order = await prisma.order.create({
      data: {
        userId,
        marketId: market.id,
        side: side as any,
        type: type as any,
        status: 'OPEN',
        price: price ? new Decimal(price) : undefined,
        stopPrice: stopPrice ? new Decimal(stopPrice) : undefined,
        quantity: qty,
        remainingQty: qty,
        fee,
        feeAsset: side === 'BUY' ? market.baseAsset.symbol : market.quoteAsset.symbol,
        clientOrderId: clientOrderId || undefined
      },
      include: { market: { include: { baseAsset: true, quoteAsset: true } } }
    });

    // Try to match order (simplified matching engine)
    if (type === 'MARKET') {
      await matchMarketOrder(order, market, userId);
    }

    // Emit to user via WebSocket
    const io = req.app.get('io');
    io?.to(`user:${userId}`).emit('order:created', order);

    // Invalidate cache
    await cache.delPattern(`orderbook:${marketSymbol}*`);

    res.status(201).json({ success: true, data: order });
  } catch (err) {
    logger.error('Create order error:', err);
    res.status(500).json({ success: false, message: 'Failed to create order' });
  }
};

// Simplified order matcher - in production use a proper matching engine
async function matchMarketOrder(order: any, market: any, userId: string) {
  try {
    const opposideSide = order.side === 'BUY' ? 'SELL' : 'BUY';

    const oppositeOrders = await prisma.order.findMany({
      where: {
        marketId: market.id,
        side: opposideSide as any,
        status: { in: ['OPEN', 'PARTIALLY_FILLED'] },
        userId: { not: userId }
      },
      orderBy: [
        { price: order.side === 'BUY' ? 'asc' : 'desc' },
        { createdAt: 'asc' }
      ],
      take: 10
    });

    let remainingQty = new Decimal(order.quantity);

    for (const matchOrder of oppositeOrders) {
      if (remainingQty.lte(0)) break;

      const matchQty = Decimal.min(remainingQty, matchOrder.remainingQty);
      const matchPrice = matchOrder.price || market.lastPrice;

      if (!matchPrice) continue;

      const quoteQty = matchQty.mul(matchPrice);

      // Create trade
      await prisma.trade.create({
        data: {
          marketId: market.id,
          orderId: order.id,
          userId: order.userId,
          counterUserId: matchOrder.userId,
          side: order.side,
          price: matchPrice,
          quantity: matchQty,
          quoteQuantity: quoteQty,
          fee: matchQty.mul(market.takerFee),
          feeAsset: order.side === 'BUY' ? market.baseAsset.symbol : market.quoteAsset.symbol,
          isMaker: false
        }
      });

      // Update orders
      await prisma.order.update({
        where: { id: order.id },
        data: {
          filledQuantity: { increment: matchQty },
          remainingQty: { decrement: matchQty },
          status: remainingQty.eq(matchQty) ? 'FILLED' : 'PARTIALLY_FILLED',
          avgFillPrice: matchPrice,
          filledAt: remainingQty.eq(matchQty) ? new Date() : undefined
        }
      });

      await prisma.order.update({
        where: { id: matchOrder.id },
        data: {
          filledQuantity: { increment: matchQty },
          remainingQty: { decrement: matchQty },
          status: matchOrder.remainingQty.eq(matchQty) ? 'FILLED' : 'PARTIALLY_FILLED',
          filledAt: matchOrder.remainingQty.eq(matchQty) ? new Date() : undefined
        }
      });

      // Update wallet balances
      await settleWallets(order, matchOrder, market, matchQty, matchPrice);

      remainingQty = remainingQty.sub(matchQty);
    }
  } catch (err) {
    logger.error('Order matching error:', err);
  }
}

async function settleWallets(buyOrder: any, sellOrder: any, market: any, qty: Decimal, price: Decimal) {
  const quoteQty = qty.mul(price);
  const fee = qty.mul(market.takerFee);

  const [buyUserId, sellUserId] = buyOrder.side === 'BUY'
    ? [buyOrder.userId, sellOrder.userId]
    : [sellOrder.userId, buyOrder.userId];

  await prisma.$transaction([
    // Buyer gets base asset (minus fee)
    prisma.wallet.upsert({
      where: { userId_assetId: { userId: buyUserId, assetId: market.baseAssetId } },
      create: { userId: buyUserId, assetId: market.baseAssetId, balance: qty.sub(fee) },
      update: { balance: { increment: qty.sub(fee) } }
    }),
    // Buyer's quote is deducted from locked
    prisma.wallet.update({
      where: { userId_assetId: { userId: buyUserId, assetId: market.quoteAssetId } },
      data: { lockedBalance: { decrement: quoteQty } }
    }),
    // Seller gets quote asset
    prisma.wallet.upsert({
      where: { userId_assetId: { userId: sellUserId, assetId: market.quoteAssetId } },
      create: { userId: sellUserId, assetId: market.quoteAssetId, balance: quoteQty },
      update: { balance: { increment: quoteQty } }
    }),
    // Seller's base is deducted from locked
    prisma.wallet.update({
      where: { userId_assetId: { userId: sellUserId, assetId: market.baseAssetId } },
      data: { lockedBalance: { decrement: qty } }
    })
  ]);
}

export const getOrders = async (req: AuthRequest, res: Response) => {
  try {
    const { status, market, side, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = { userId: req.user!.id };
    if (status) where.status = status;
    if (side) where.side = side;
    if (market) {
      const m = await prisma.market.findUnique({ where: { symbol: (market as string).toUpperCase() } });
      if (m) where.marketId = m.id;
    }

    const [orders, total] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        include: { market: { include: { baseAsset: true, quoteAsset: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit)
      }),
      prisma.order.count({ where })
    ]);

    res.json({
      success: true,
      data: { orders, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get orders' });
  }
};

export const cancelOrder = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId } = req.params;

    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: req.user!.id },
      include: { market: true }
    });

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (!['OPEN', 'PARTIALLY_FILLED', 'PENDING'].includes(order.status)) {
      return res.status(400).json({ success: false, message: 'Order cannot be cancelled' });
    }

    // Release locked funds
    const refundAssetId = order.side === 'BUY' ? order.market.quoteAssetId : order.market.baseAssetId;
    const refundAmount = order.side === 'BUY'
      ? order.remainingQty.mul(order.price || new Decimal(0))
      : order.remainingQty;

    await prisma.$transaction([
      prisma.order.update({
        where: { id: orderId },
        data: { status: 'CANCELLED', cancelledAt: new Date() }
      }),
      prisma.wallet.update({
        where: { userId_assetId: { userId: req.user!.id, assetId: refundAssetId } },
        data: { lockedBalance: { decrement: refundAmount } }
      })
    ]);

    const io = req.app.get('io');
    io?.to(`user:${req.user!.id}`).emit('order:cancelled', { orderId });

    res.json({ success: true, message: 'Order cancelled' });
  } catch (err) {
    logger.error('Cancel order error:', err);
    res.status(500).json({ success: false, message: 'Failed to cancel order' });
  }
};

export const getOrderBook = async (req: AuthRequest, res: Response) => {
  try {
    const { symbol } = req.params;
    const { depth = 20 } = req.query;

    const cacheKey = `orderbook:${symbol}:${depth}`;
    const cached = await cache.get(cacheKey);
    if (cached) return res.json({ success: true, data: cached });

    const market = await prisma.market.findUnique({ where: { symbol: symbol.toUpperCase() } });
    if (!market) return res.status(404).json({ success: false, message: 'Market not found' });

    const [bids, asks] = await prisma.$transaction([
      prisma.order.groupBy({
        by: ['price'],
        where: { marketId: market.id, side: 'BUY', status: { in: ['OPEN', 'PARTIALLY_FILLED'] } },
        _sum: { remainingQty: true },
        orderBy: { price: 'desc' },
        take: Number(depth)
      }),
      prisma.order.groupBy({
        by: ['price'],
        where: { marketId: market.id, side: 'SELL', status: { in: ['OPEN', 'PARTIALLY_FILLED'] } },
        _sum: { remainingQty: true },
        orderBy: { price: 'asc' },
        take: Number(depth)
      })
    ]);

    const orderbook = {
      symbol: symbol.toUpperCase(),
      bids: bids.map(b => [b.price?.toString(), b._sum.remainingQty?.toString()]),
      asks: asks.map(a => [a.price?.toString(), a._sum.remainingQty?.toString()]),
      timestamp: Date.now()
    };

    await cache.set(cacheKey, orderbook, 2);
    res.json({ success: true, data: orderbook });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get order book' });
  }
};

export const getTradeHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { symbol } = req.params;
    const { limit = 50 } = req.query;

    const market = await prisma.market.findUnique({ where: { symbol: symbol.toUpperCase() } });
    if (!market) return res.status(404).json({ success: false, message: 'Market not found' });

    const trades = await prisma.trade.findMany({
      where: { marketId: market.id },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      select: { price: true, quantity: true, side: true, createdAt: true }
    });

    res.json({ success: true, data: trades });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get trade history' });
  }
};

// ---- BROKER ROUTING (added for real trading) ----
import { routeOrderToBinance, isBrokerEnabled } from '../services/brokerService';
import { recordRevenue } from '../services/revenueService';

export const createOrderWithBroker = async (req: AuthRequest, res: Response) => {
  try {
    const { marketSymbol, side, type, price, quantity, stopPrice, clientOrderId } = req.body;
    const userId = req.user!.id;

    const market = await prisma.market.findUnique({
      where: { symbol: marketSymbol.toUpperCase() },
      include: { baseAsset: true, quoteAsset: true }
    });
    if (!market || !market.isActive) {
      return res.status(404).json({ success: false, message: 'Market not found or inactive' });
    }

    const qty = new Decimal(quantity);
    if (qty.lt(market.minOrderSize) || qty.gt(market.maxOrderSize)) {
      return res.status(400).json({ success: false, message: `Quantity must be between ${market.minOrderSize} and ${market.maxOrderSize}` });
    }

    let requiredAssetId: string;
    let requiredAmount: Decimal;
    if (side === 'BUY') {
      requiredAssetId = market.quoteAssetId;
      const orderPrice = type === 'MARKET' ? (market.lastPrice || new Decimal(0)) : new Decimal(price);
      requiredAmount = qty.mul(orderPrice).mul(new Decimal(1).add(market.takerFee));
    } else {
      requiredAssetId = market.baseAssetId;
      requiredAmount = qty;
    }

    const wallet = await prisma.wallet.findUnique({ where: { userId_assetId: { userId, assetId: requiredAssetId } } });
    const availableBalance = wallet ? wallet.balance.sub(wallet.lockedBalance) : new Decimal(0);
    if (availableBalance.lt(requiredAmount)) {
      return res.status(400).json({ success: false, message: 'Insufficient balance', data: { available: availableBalance.toString(), required: requiredAmount.toString() } });
    }

    // Lock funds in our DB
    await prisma.wallet.update({
      where: { userId_assetId: { userId, assetId: requiredAssetId } },
      data: { lockedBalance: { increment: requiredAmount } }
    });

    const fee = qty.mul(type === 'MARKET' ? market.takerFee : market.makerFee);

    // Create order record
    const order = await prisma.order.create({
      data: {
        userId, marketId: market.id,
        side: side as any, type: type as any, status: 'OPEN',
        price: price ? new Decimal(price) : undefined,
        stopPrice: stopPrice ? new Decimal(stopPrice) : undefined,
        quantity: qty, remainingQty: qty, fee,
        feeAsset: side === 'BUY' ? market.baseAsset.symbol : market.quoteAsset.symbol,
        clientOrderId: clientOrderId || undefined
      },
      include: { market: { include: { baseAsset: true, quoteAsset: true } } }
    });

    // --- Try to route to Binance Broker ---
    if (isBrokerEnabled()) {
      const brokerResult = await routeOrderToBinance(
        userId, market.symbol, side, type === 'STOP_LOSS' ? 'MARKET' : type as any,
        qty.toNumber(), price ? parseFloat(price) : undefined
      );

      if (brokerResult.success) {
        // Update order with real fill data
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: brokerResult.status === 'FILLED' ? 'FILLED' : 'OPEN',
            filledQuantity: new Decimal(brokerResult.filledQty),
            remainingQty: qty.sub(new Decimal(brokerResult.filledQty)),
            avgFillPrice: new Decimal(brokerResult.avgPrice),
            filledAt: brokerResult.status === 'FILLED' ? new Date() : undefined,
          }
        });

        // Record broker rebate revenue (~0.04% of trade value)
        const tradeValue = brokerResult.filledQty * brokerResult.avgPrice;
        const rebate = tradeValue * 0.001 * 0.4; // 0.1% fee × 40% rebate
        if (rebate > 0) {
          await recordRevenue('BROKER_REBATE', rebate, 'USD', {
            orderId: order.id,
            binanceOrderId: brokerResult.binanceOrderId,
            symbol: market.symbol,
          });
        }
      }
    } else {
      // Fall back to internal matching engine
      await matchMarketOrderInternal(order, market, userId);
    }

    const io = req.app.get('io');
    io?.to(`user:${userId}`).emit('order:created', order);
    await cache.delPattern(`orderbook:${marketSymbol}*`);

    res.status(201).json({
      success: true,
      data: order,
      meta: { routed: isBrokerEnabled() ? 'binance-broker' : 'internal-matching' }
    });
  } catch (err: any) {
    logger.error('Create order (broker) error:', err);
    res.status(500).json({ success: false, message: 'Failed to create order' });
  }
};

async function matchMarketOrderInternal(order: any, market: any, userId: string) {
  // Re-use original internal matching logic
  try {
    const opposideSide = order.side === 'BUY' ? 'SELL' : 'BUY';
    const oppositeOrders = await prisma.order.findMany({
      where: { marketId: market.id, side: opposideSide as any, status: { in: ['OPEN', 'PARTIALLY_FILLED'] }, userId: { not: userId } },
      orderBy: [{ price: order.side === 'BUY' ? 'asc' : 'desc' }, { createdAt: 'asc' }],
      take: 10
    });
    let remainingQty = new Decimal(order.quantity);
    for (const matchOrder of oppositeOrders) {
      if (remainingQty.lte(0)) break;
      const matchQty   = Decimal.min(remainingQty, matchOrder.remainingQty);
      const matchPrice = matchOrder.price || market.lastPrice;
      if (!matchPrice) continue;
      const quoteQty = matchQty.mul(matchPrice);
      await prisma.trade.create({
        data: { marketId: market.id, orderId: order.id, userId: order.userId, counterUserId: matchOrder.userId, side: order.side, price: matchPrice, quantity: matchQty, quoteQuantity: quoteQty, fee: matchQty.mul(market.takerFee), feeAsset: order.side === 'BUY' ? market.baseAsset.symbol : market.quoteAsset.symbol, isMaker: false }
      });
      await prisma.order.update({ where: { id: order.id }, data: { filledQuantity: { increment: matchQty }, remainingQty: { decrement: matchQty }, status: remainingQty.eq(matchQty) ? 'FILLED' : 'PARTIALLY_FILLED', avgFillPrice: matchPrice, filledAt: remainingQty.eq(matchQty) ? new Date() : undefined } });
      await prisma.order.update({ where: { id: matchOrder.id }, data: { filledQuantity: { increment: matchQty }, remainingQty: { decrement: matchQty }, status: matchOrder.remainingQty.eq(matchQty) ? 'FILLED' : 'PARTIALLY_FILLED', filledAt: matchOrder.remainingQty.eq(matchQty) ? new Date() : undefined } });
      remainingQty = remainingQty.sub(matchQty);
    }
  } catch (err) { logger.error('Internal matching error:', err); }
}
