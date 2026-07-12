import { Router } from 'express';
import { body } from 'express-validator';
import { getMyInvoices, getInvoicePdf, createCheckoutSession, markInvoicePaidManually, getAllInvoicesAdmin } from '../controllers/invoiceController';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();
router.use(authenticate);

router.get('/mine', getMyInvoices);
router.get('/:id/pdf', getInvoicePdf);
router.post('/:id/checkout', createCheckoutSession);

// Admin
router.get('/', requireRole('ADMIN'), getAllInvoicesAdmin);
router.post('/:id/mark-paid', requireRole('ADMIN'), [
  body('notes').optional().isString(),
], validate, markInvoicePaidManually);

export default router;
