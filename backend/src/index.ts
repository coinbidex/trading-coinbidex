import 'dotenv/config'
import express from 'express'
import { createServer } from 'http'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import morgan from 'morgan'
import { Server as SocketIOServer } from 'socket.io'

import { logger } from './utils/logger'
import { connectRedis } from './utils/redis'
import { prisma } from './utils/prisma'
import { setupWebSocket } from './websocket/socketServer'
import { startMarketDataService } from './services/marketDataService'
import { startPriceAlertService } from './services/priceAlertService'
import { loadConfigsFromDB, subscribeToConfigUpdates } from './routes/config'
import { platformConfig } from './services/platformMode'

// Routes
import authRoutes          from './routes/auth'
import userRoutes          from './routes/users'
import marketRoutes        from './routes/markets'
import orderRoutes         from './routes/orders'
import walletRoutes        from './routes/wallets'
import swapRoutes          from './routes/swaps'
import transactionRoutes   from './routes/transactions'
import listingRoutes       from './routes/listings'
import advertisementRoutes from './routes/advertisements'
import assetRoutes         from './routes/assets'
import adminRoutes         from './routes/admin'
import watchlistRoutes     from './routes/watchlist'
import notificationRoutes  from './routes/notifications'
import moonpayRoutes       from './routes/moonpay'
import configRoutes        from './routes/config'
import { generalLimiter, authLimiter } from './middleware/rateLimiter'

const app        = express()
const httpServer = createServer(app)

const io = new SocketIOServer(httpServer, {
  cors: {
    origin:      process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000','http://localhost:3001'],
    methods:     ['GET', 'POST'],
    credentials: true,
  },
  transports:    ['websocket', 'polling'],
  pingTimeout:   60000,
  pingInterval:  25000,
})

// Trust proxy (needed for correct IP behind Nginx)
app.set('trust proxy', 1)
app.set('io', io)

// Security middleware
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }))
app.use(compression())
app.use(cors({
  origin:         process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000','http://localhost:3001'],
  credentials:    true,
  methods:        ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-API-Key'],
}))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use(morgan('combined', { stream: { write: msg => logger.http(msg.trim()) } }))

// Rate limiting
app.use(generalLimiter)

// Inject platform mode header so frontend knows which env it's talking to
app.use((_req, res, next) => {
  res.setHeader('X-Platform-Mode', platformConfig.mode)
  next()
})

// Health check (no auth, no rate limit)
app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({
      status:   'ok',
      app:      'Coinbidex Trading',
      mode:     platformConfig.mode,
      version:  '2.0.0',
      time:     new Date().toISOString(),
    })
  } catch (err) {
    res.status(503).json({ status: 'error', message: 'Database unavailable' })
  }
})

const v1 = '/api/v1'
app.use(`${v1}/auth`,           authLimiter, authRoutes)
app.use(`${v1}/users`,          userRoutes)
app.use(`${v1}/markets`,        marketRoutes)
app.use(`${v1}/orders`,         orderRoutes)
app.use(`${v1}/wallets`,        walletRoutes)
app.use(`${v1}/swaps`,          swapRoutes)
app.use(`${v1}/transactions`,   transactionRoutes)
app.use(`${v1}/listings`,       listingRoutes)
app.use(`${v1}/advertisements`, advertisementRoutes)
app.use(`${v1}/assets`,         assetRoutes)
app.use(`${v1}/admin`,          adminRoutes)
app.use(`${v1}/watchlist`,      watchlistRoutes)
app.use(`${v1}/notifications`,  notificationRoutes)
app.use(`${v1}/moonpay`,        moonpayRoutes)
app.use(`${v1}/config`,         configRoutes)

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` })
})

// Global error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error:', err)
  const status = err.status || err.statusCode || 500
  res.status(status).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  })
})

const PORT = parseInt(process.env.PORT || '4000')

async function bootstrap() {
  try {
    await prisma.$connect()
    logger.info('✅ Database connected')

    await connectRedis()
    logger.info('✅ Redis connected')

    await loadConfigsFromDB()
    logger.info('✅ Config loaded from database')

    subscribeToConfigUpdates()
    logger.info('✅ Subscribed to live config updates')

    setupWebSocket(io)
    logger.info('✅ WebSocket ready')

    await startMarketDataService(io)
    logger.info('✅ Market data service started')

    startPriceAlertService(io)
    logger.info('✅ Price alerts ready')

    httpServer.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 Coinbidex [${platformConfig.mode.toUpperCase()}] running on port ${PORT}`)
    })
  } catch (err) {
    logger.error('Failed to start:', err)
    process.exit(1)
  }
}

process.on('SIGTERM', async () => {
  logger.info('Shutting down gracefully...')
  await prisma.$disconnect()
  process.exit(0)
})

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason)
})

bootstrap()
export { io }
