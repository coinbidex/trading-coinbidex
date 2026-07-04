import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { Response } from 'express';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, unread } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const where: any = { userId: req.user!.id };
    if (unread === 'true') where.isRead = false;
    const [notifications, total, unreadCount] = await prisma.$transaction([
      prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: Number(limit) }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId: req.user!.id, isRead: false } })
    ]);
    res.json({ success: true, data: { notifications, unreadCount, pagination: { page: Number(page), limit: Number(limit), total } } });
  } catch { res.status(500).json({ success: false, message: 'Failed to get notifications' }); }
});

router.patch('/read-all', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, isRead: false },
      data: { isRead: true, readAt: new Date() }
    });
    res.json({ success: true, message: 'All marked as read' });
  } catch { res.status(500).json({ success: false, message: 'Failed' }); }
});

router.patch('/:id/read', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user!.id },
      data: { isRead: true, readAt: new Date() }
    });
    res.json({ success: true });
  } catch { res.status(500).json({ success: false, message: 'Failed' }); }
});

export default router;
