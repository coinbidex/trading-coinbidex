import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import {
  getSwapQuote, executeSwap, buildOnChainSwap,
  getSwapHistory, getSupportedSwapTokens, getRoutingStatus,
} from '../controllers/swapController'

const router = Router()
router.use(authenticate)

router.get('/quote',   getSwapQuote)
router.post('/execute', executeSwap)
router.post('/build-onchain', buildOnChainSwap)
router.get('/history', getSwapHistory)
router.get('/tokens',  getSupportedSwapTokens)
router.get('/routing', getRoutingStatus)

export default router
