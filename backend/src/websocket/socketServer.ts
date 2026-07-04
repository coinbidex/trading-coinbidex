import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';
import { cache } from '../utils/redis';
import { getCandleData } from '../services/marketDataService';

export function setupWebSocket(io: SocketIOServer) {
  // Authentication middleware for socket
  io.use(async (socket: Socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        (socket as any).userId = decoded.userId;
        socket.join(`user:${decoded.userId}`);
      }
    } catch {}
    next();
  });

  io.on('connection', (socket: Socket) => {
    const userId = (socket as any).userId;
    logger.info(`Socket connected: ${socket.id} ${userId ? `(user: ${userId})` : '(public)'}`);

    // Subscribe to market ticker
    socket.on('subscribe:market', (symbol: string) => {
      const room = `market:${symbol.toUpperCase()}`;
      socket.join(room);
      logger.debug(`Socket ${socket.id} subscribed to ${room}`);
    });

    socket.on('unsubscribe:market', (symbol: string) => {
      socket.leave(`market:${symbol.toUpperCase()}`);
    });

    // Subscribe to order book
    socket.on('subscribe:orderbook', async (symbol: string) => {
      socket.join(`orderbook:${symbol.toUpperCase()}`);
      const cached = await cache.get(`orderbook:${symbol.toUpperCase()}:20`);
      if (cached) socket.emit('orderbook:snapshot', cached);
    });

    // Request candle data
    socket.on('request:candles', async ({ symbol, interval }: { symbol: string; interval: string }) => {
      const candles = await getCandleData(symbol, interval);
      socket.emit('candles:data', { symbol, interval, candles });
    });

    // User-specific subscriptions
    if (userId) {
      socket.on('subscribe:portfolio', () => {
        socket.join(`portfolio:${userId}`);
      });
    }

    socket.on('disconnect', () => {
      logger.debug(`Socket disconnected: ${socket.id}`);
    });

    socket.on('error', (err) => {
      logger.error('Socket error:', err);
    });
  });
}
