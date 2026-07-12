import { Router } from 'express';
import { body } from 'express-validator';
import { createTicket, getMyTickets, getTicket, replyToTicket, closeTicket, getAllTicketsAdmin } from '../controllers/ticketController';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();
router.use(authenticate);

router.post('/', [
  body('subject').notEmpty().trim().isLength({ max: 200 }),
  body('message').notEmpty().trim().isLength({ min: 5 }),
], validate, createTicket);
router.get('/mine', getMyTickets);
router.get('/:id', getTicket);
router.post('/:id/reply', [
  body('message').notEmpty().trim().isLength({ min: 1 }),
], validate, replyToTicket);
router.post('/:id/close', closeTicket);

// Admin
router.get('/', requireRole('ADMIN'), getAllTicketsAdmin);

export default router;
