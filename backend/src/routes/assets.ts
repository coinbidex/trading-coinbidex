import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { Request, Response } from 'express';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const where: any = { isActive: true };
    if (search) {
      where.OR = [
        { symbol: { contains: (search as string).toUpperCase() } },
        { name: { contains: search as string, mode: 'insensitive' } }
      ];
    }
    const [assets, total] = await prisma.$transaction([
      prisma.asset.findMany({ where, orderBy: { rank: 'asc' }, skip, take: Number(limit) }),
      prisma.asset.count({ where })
    ]);
    res.json({ success: true, data: { assets, pagination: { page: Number(page), limit: Number(limit), total } } });
  } catch { res.status(500).json({ success: false, message: 'Failed to get assets' }); }
});

router.get('/:symbol', async (req: Request, res: Response) => {
  try {
    const asset = await prisma.asset.findUnique({ where: { symbol: req.params.symbol.toUpperCase() } });
    if (!asset) return res.status(404).json({ success: false, message: 'Asset not found' });
    res.json({ success: true, data: asset });
  } catch { res.status(500).json({ success: false, message: 'Failed to get asset' }); }
});

export default router;
