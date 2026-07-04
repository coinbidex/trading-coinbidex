import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { Response } from 'express';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const items = await prisma.watchlistItem.findMany({ where: { userId: req.user!.id } });
    res.json({ success: true, data: items });
  } catch { res.status(500).json({ success: false, message: 'Failed to get watchlist' }); }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { symbol } = req.body;
    const item = await prisma.watchlistItem.upsert({
      where: { userId_symbol: { userId: req.user!.id, symbol: symbol.toUpperCase() } },
      create: { userId: req.user!.id, symbol: symbol.toUpperCase() },
      update: {}
    });
    res.status(201).json({ success: true, data: item });
  } catch { res.status(500).json({ success: false, message: 'Failed to add to watchlist' }); }
});

router.delete('/:symbol', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.watchlistItem.deleteMany({
      where: { userId: req.user!.id, symbol: req.params.symbol.toUpperCase() }
    });
    res.json({ success: true, message: 'Removed from watchlist' });
  } catch { res.status(500).json({ success: false, message: 'Failed to remove' }); }
});

export default router;
