import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import { Response } from 'express';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { type, status, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const where: any = { userId: req.user!.id };
    if (type) where.type = type;
    if (status) where.status = status;

    const [transactions, total] = await prisma.$transaction([
      prisma.transaction.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: Number(limit) }),
      prisma.transaction.count({ where })
    ]);

    res.json({ success: true, data: { transactions, pagination: { page: Number(page), limit: Number(limit), total } } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get transactions' });
  }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const tx = await prisma.transaction.findFirst({
      where: { id: req.params.id, userId: req.user!.id }
    });
    if (!tx) return res.status(404).json({ success: false, message: 'Transaction not found' });
    res.json({ success: true, data: tx });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get transaction' });
  }
});

export default router;
