import { Server as SocketIOServer } from 'socket.io';
import { prisma } from '../utils/prisma';
import { cache } from '../utils/redis';
import { logger } from '../utils/logger';

export function startPriceAlertService(io: SocketIOServer) {
  setInterval(async () => {
    try {
      const alerts = await prisma.priceAlert.findMany({
        where: { isActive: true, triggered: false },
        include: { asset: true }
      });

      for (const alert of alerts) {
        const ticker = await cache.get<any>(`ticker:${alert.asset.symbol}USDT`);
        if (!ticker) continue;

        const currentPrice = ticker.lastPrice;
        const triggered =
          (alert.condition === 'above' && currentPrice >= parseFloat(alert.price.toString())) ||
          (alert.condition === 'below' && currentPrice <= parseFloat(alert.price.toString()));

        if (triggered) {
          await prisma.priceAlert.update({
            where: { id: alert.id },
            data: { triggered: true, triggeredAt: new Date(), isActive: false }
          });

          await prisma.notification.create({
            data: {
              userId: alert.userId,
              type: 'PRICE_ALERT',
              title: `Price Alert: ${alert.asset.symbol}`,
              message: `${alert.asset.symbol} is now ${alert.condition} $${alert.price} (current: $${currentPrice.toFixed(2)})`,
              data: { symbol: alert.asset.symbol, price: currentPrice, condition: alert.condition }
            }
          });

          io.to(`user:${alert.userId}`).emit('alert:price', {
            symbol: alert.asset.symbol,
            condition: alert.condition,
            targetPrice: alert.price,
            currentPrice
          });
        }
      }
    } catch (err) {
      logger.error('Price alert service error:', err);
    }
  }, 5000);
}
