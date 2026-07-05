import { Router } from 'express'
import { body } from 'express-validator'
import {
  register, login, refreshToken, logout, getMe, sessionStatus,
  verifyEmail, forgotPassword, resetPassword, resendVerificationEmail,
} from '../controllers/authController'
import { authenticate } from '../middleware/auth'
import { validate } from '../middleware/validate'

const router = Router()

router.post('/register', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('username').isLength({ min: 3, max: 20 }).matches(/^[a-zA-Z0-9_]+$/).withMessage('Username: 3-20 chars, letters/numbers/_'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
], validate, register)

router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required'),
], validate, login)

router.post('/refresh',         refreshToken)
router.post('/logout',          authenticate, logout)
router.get('/session',          sessionStatus)  // public — called by coinbidex.com, cookie-based, no tokens returned
router.get('/me',               authenticate, getMe)
router.get('/verify-email',     verifyEmail)
router.post('/resend-verification', resendVerificationEmail)
router.post('/forgot-password', [body('email').isEmail().withMessage('Valid email required')], validate, forgotPassword)
router.post('/reset-password', [
  body('token').notEmpty().withMessage('Token required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
], validate, resetPassword)

export default router
