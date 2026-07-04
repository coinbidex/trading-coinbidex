import { Router } from 'express';
import {
  getMarkets, getMarketDetail, getCandles,
  getTicker, getAllTickersEndpoint, getNews, searchMarkets
} from '../controllers/marketController';

const router = Router();

// IMPORTANT: specific routes MUST come before /:symbol wildcard
router.get('/tickers', getAllTickersEndpoint);
router.get('/news',    getNews);
router.get('/search',  searchMarkets);

// /:symbol routes — must be last
router.get('/:symbol/candles', getCandles);
router.get('/:symbol/ticker',  getTicker);
router.get('/:symbol',         getMarketDetail);
router.get('/',                getMarkets);

export default router;
