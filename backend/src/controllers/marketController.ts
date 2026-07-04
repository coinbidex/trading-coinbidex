import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { cache } from '../utils/redis';
import { getAllTickers, getCandleData, getMarketTicker, getCryptoNews } from '../services/marketDataService';
import { logger } from '../utils/logger';

export const getMarkets = async (req: Request, res: Response) => {
  try {
    const { search, sortBy = 'volume24h', order = 'desc', page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = { isActive: true };
    if (search) {
      where.OR = [
        { symbol: { contains: (search as string).toUpperCase() } },
        { baseAsset: { name: { contains: search as string, mode: 'insensitive' } } }
      ];
    }

    const [markets, total] = await prisma.$transaction([
      prisma.market.findMany({
        where,
        include: {
          baseAsset: { select: { symbol: true, name: true, logoUrl: true } },
          quoteAsset: { select: { symbol: true, name: true } }
        },
        orderBy: { [sortBy as string]: order as any },
        skip,
        take: Number(limit)
      }),
      prisma.market.count({ where })
    ]);

    // Merge with live ticker data
    const tickers = await getAllTickers();
    const tickerMap = Object.fromEntries(tickers.map(t => [t.symbol, t]));

    const enriched = markets.map(m => ({
      ...m,
      ticker: tickerMap[m.symbol] || null
    }));

    res.json({ success: true, data: { markets: enriched, pagination: { page: Number(page), limit: Number(limit), total } } });
  } catch (err) {
    logger.error('Get markets error:', err);
    res.status(500).json({ success: false, message: 'Failed to get markets' });
  }
};

export const getMarketDetail = async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;

    const market = await prisma.market.findUnique({
      where: { symbol: symbol.toUpperCase() },
      include: {
        baseAsset: true,
        quoteAsset: true
      }
    });

    if (!market) return res.status(404).json({ success: false, message: 'Market not found' });

    const ticker = await getMarketTicker(symbol);

    res.json({ success: true, data: { ...market, ticker } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get market' });
  }
};

export const getCandles = async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const { interval = '1h', limit = 500 } = req.query;

    const validIntervals = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];
    if (!validIntervals.includes(interval as string)) {
      return res.status(400).json({ success: false, message: 'Invalid interval' });
    }

    const candles = await getCandleData(symbol.toUpperCase(), interval as string, Number(limit));
    res.json({ success: true, data: { symbol, interval, candles } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get candles' });
  }
};

export const getTicker = async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const ticker = await cache.get(`ticker:${symbol.toUpperCase()}`);
    if (!ticker) return res.status(404).json({ success: false, message: 'Ticker not found' });
    res.json({ success: true, data: ticker });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get ticker' });
  }
};

export const getAllTickersEndpoint = async (req: Request, res: Response) => {
  try {
    const tickers = await getAllTickers();
    res.json({ success: true, data: tickers });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get tickers' });
  }
};

export const getNews = async (req: Request, res: Response) => {
  try {
    const { limit = 20 } = req.query;
    const news = await getCryptoNews(Number(limit));
    res.json({ success: true, data: news });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get news' });
  }
};

export const searchMarkets = async (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ success: true, data: [] });

    const results = await prisma.market.findMany({
      where: {
        isActive: true,
        OR: [
          { symbol: { contains: (q as string).toUpperCase() } },
          { baseAsset: { name: { contains: q as string, mode: 'insensitive' } } },
          { baseAsset: { symbol: { contains: (q as string).toUpperCase() } } }
        ]
      },
      include: { baseAsset: { select: { symbol: true, name: true, logoUrl: true } } },
      take: 10
    });

    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Search failed' });
  }
};
