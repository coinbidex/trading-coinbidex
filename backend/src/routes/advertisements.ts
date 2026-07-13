import { Router } from 'express';
import { createAd, getActiveAds, trackAdClick, getMyAds, reviewAd, getAdPricing } from '../controllers/advertisementController';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

router.get('/active', getActiveAds);
router.get('/pricing', getAdPricing);
router.post('/:id/click', trackAdClick);
router.post('/', authenticate, createAd);
router.get('/mine', authenticate, getMyAds);
router.patch('/:id/review', authenticate, requireRole('ADMIN'), reviewAd);

export default router;

// Admin: get all ads regardless of status
router.get('/all-admin', authenticate, requireRole('ADMIN'), async (req, res: any) => {
  try {
    const { prisma } = await import('../utils/prisma');
    const ads = await prisma.advertisement.findMany({
      include: { user: { select: { username: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ success: true, data: ads });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to get ads' });
  }
});
