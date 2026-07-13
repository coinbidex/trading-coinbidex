import { Router } from 'express';
import { body } from 'express-validator';
import { submitListing, getListings, getMyListings, reviewListing } from '../controllers/listingController';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

router.get('/', getListings);
router.get('/mine', authenticate, getMyListings);
router.post('/', authenticate, [
  body('projectName').notEmpty().trim(),
  body('tokenSymbol').notEmpty().trim().toUpperCase().isLength({ min: 2, max: 10 }),
  body('tokenName').notEmpty().trim(),
  body('description').notEmpty().isLength({ min: 100 }),
  body('website').isURL(),
  body('totalSupply').notEmpty(),
  body('blockchain').notEmpty(),
], validate, submitListing);
router.patch('/:id/review', authenticate, requireRole('ADMIN'), [
  body('status').isIn(['APPROVED', 'REJECTED', 'LIVE', 'SUSPENDED', 'UNDER_REVIEW']),
], validate, reviewListing);

export default router;
