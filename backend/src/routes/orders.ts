import { Router } from 'express';
import { body } from 'express-validator';
import { createOrder, getOrders, cancelOrder, getOrderBook, getTradeHistory } from '../controllers/orderController';
import { authenticate } from '../middleware/auth';
import { tradingLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';

const router = Router();

router.use(authenticate);

router.post('/', tradingLimiter, [
  body('marketSymbol').notEmpty().trim().toUpperCase(),
  body('side').isIn(['BUY', 'SELL']),
  body('type').isIn(['MARKET', 'LIMIT', 'STOP_LOSS', 'STOP_LIMIT', 'TAKE_PROFIT']),
  body('quantity').isFloat({ gt: 0 }),
  body('price').optional().isFloat({ gt: 0 })
], validate, createOrder);

router.get('/', getOrders);
router.delete('/:orderId', cancelOrder);
router.get('/orderbook/:symbol', getOrderBook);
router.get('/trades/:symbol', getTradeHistory);

export default router;
