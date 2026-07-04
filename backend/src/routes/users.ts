import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import { Response } from 'express';

const router = Router();
router.use(authenticate);

router.get('/profile', async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true, email: true, username: true, firstName: true, lastName: true,
        phone: true, country: true, avatarUrl: true, role: true, status: true,
        kycStatus: true, createdAt: true, referralCode: true
      }
    });
    res.json({ success: true, data: user });
  } catch { res.status(500).json({ success: false, message: 'Failed to get profile' }); }
});

router.patch('/profile', async (req: AuthRequest, res: Response) => {
  try {
    const { firstName, lastName, phone, country } = req.body;
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { firstName, lastName, phone, country }
    });
    res.json({ success: true, data: user });
  } catch { res.status(500).json({ success: false, message: 'Failed to update profile' }); }
});

router.post('/price-alert', async (req: AuthRequest, res: Response) => {
  try {
    const { symbol, condition, price } = req.body;
    const asset = await prisma.asset.findUnique({ where: { symbol: symbol.toUpperCase() } });
    if (!asset) return res.status(404).json({ success: false, message: 'Asset not found' });
    const alert = await prisma.priceAlert.create({
      data: { userId: req.user!.id, assetId: asset.id, condition, price }
    });
    res.status(201).json({ success: true, data: alert });
  } catch { res.status(500).json({ success: false, message: 'Failed to create alert' }); }
});

router.get('/price-alerts', async (req: AuthRequest, res: Response) => {
  try {
    const alerts = await prisma.priceAlert.findMany({
      where: { userId: req.user!.id },
      include: { asset: { select: { symbol: true, name: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: alerts });
  } catch { res.status(500).json({ success: false, message: 'Failed to get alerts' }); }
});

router.delete('/price-alerts/:id', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.priceAlert.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
    res.json({ success: true, message: 'Alert deleted' });
  } catch { res.status(500).json({ success: false, message: 'Failed to delete alert' }); }
});

export default router;
