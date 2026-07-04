import { Router, Response } from 'express'
import {
  getDashboardStats, getUsers, updateUserStatus,
  manageMarket, createMarket,
  getPendingWithdrawals, processWithdrawal,
} from '../controllers/adminController'
import { getRoutingStatus } from '../controllers/swapController'
import { authenticate, requireRole, AuthRequest } from '../middleware/auth'
import { getRevenueSummary } from '../services/revenueService'
import { getBrokerEarnings } from '../services/brokerService'
import { getRouteStatus, getTodayRoutingStats } from '../services/routingService'
import { logger } from '../utils/logger'

const router = Router()
router.use(authenticate, requireRole('ADMIN'))

// ── Core admin endpoints ──────────────────────────────────────
router.get('/dashboard',          getDashboardStats)
router.get('/users',              getUsers)
router.patch('/users/:id',        updateUserStatus)
router.post('/markets',           createMarket)
router.patch('/markets/:id',      manageMarket)
router.get('/withdrawals',        getPendingWithdrawals)
router.patch('/withdrawals/:id',  processWithdrawal)

// ── All markets list ──────────────────────────────────────────
router.get('/markets', async (_req: AuthRequest, res: Response) => {
  try {
    const { prisma } = await import('../utils/prisma')
    const markets = await prisma.market.findMany({
      include: { baseAsset: true, quoteAsset: true },
      orderBy: { symbol: 'asc' },
    })
    res.json({ success: true, data: markets })
  } catch (err) {
    logger.error('Admin get markets error:', err)
    res.status(500).json({ success: false, message: 'Failed to get markets' })
  }
})

// ── Revenue summary ───────────────────────────────────────────
router.get('/revenue', async (_req: AuthRequest, res: Response) => {
  try {
    const [revenue, broker] = await Promise.all([
      getRevenueSummary(),
      getBrokerEarnings(),
    ])
    res.json({ success: true, data: { revenue, broker } })
  } catch (err) {
    logger.error('Admin revenue error:', err)
    res.status(500).json({ success: false, message: 'Failed to get revenue' })
  }
})

// ── Routing / monetization status ────────────────────────────
router.get('/routing', async (_req: AuthRequest, res: Response) => {
  try {
    const [status, todayStats] = await Promise.all([
      Promise.resolve(getRouteStatus()),
      getTodayRoutingStats(),
    ])
    res.json({ success: true, data: { status, today: todayStats } })
  } catch (err) {
    logger.error('Admin routing status error:', err)
    res.status(500).json({ success: false, message: 'Failed to get routing status' })
  }
})

export default router
