import { Router } from 'express';
import { body } from 'express-validator';
import { createAd, getActiveAds, trackAdClick, getMyAds, reviewAd, getAdPricing } from '../controllers/advertisementController';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { prisma } from '../utils/prisma';

const router = Router();

router.get('/active', getActiveAds);
router.get('/pricing', getAdPricing);
router.post('/:id/click', trackAdClick);
router.post('/', authenticate, [
  body('type').notEmpty(),
  body('title').notEmpty().trim(),
  body('packageId').notEmpty().withMessage('Choose an ad package — see GET /advertisements/pricing'),
], validate, createAd);
router.get('/mine', authenticate, getMyAds);
router.patch('/:id/review', authenticate, requireRole('ADMIN'), [
  body('status').isIn(['APPROVED', 'ACTIVE', 'REJECTED', 'PAUSED']),
], validate, reviewAd);

// Admin: get all ads regardless of status
router.get('/all-admin', authenticate, requireRole('ADMIN'), async (req, res: any) => {
  try {
    const ads = await prisma.advertisement.findMany({
      include: { user: { select: { username: true, email: true } }, package: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ success: true, data: ads });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to get ads' });
  }
});

export default router;
