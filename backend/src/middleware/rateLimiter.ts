import rateLimit from 'express-rate-limit'
import { Request, Response } from 'express'
import { IS_DEMO } from '../services/platformMode'

const sendRateLimit = (
  res: Response,
  message: string,
  retryAfter: number
) => {
  return res.status(429).json({
    success: false,
    code: 'RATE_LIMIT',
    message,
    retryAfter,
  })
}

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  // MUCH MORE GENEROUS
  max: IS_DEMO ? 5000 : 2000,

  standardHeaders: true,
  legacyHeaders: false,

  skip: req => {
    if (req.path === '/health') return true
    if (req.path.includes('/socket.io')) return true
    return false
  },

  handler: (_req, res) => {
    sendRateLimit(
      res,
      'Server is temporarily busy. Please try again shortly.',
      60
    )
  },
})

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  // old values were too low
  max: IS_DEMO ? 120 : 40,

  standardHeaders: true,
  legacyHeaders: false,

  skipSuccessfulRequests: true,

  handler: (_req, res) => {
    sendRateLimit(
      res,
      'Too many login attempts. Please wait a few minutes and try again.',
      300
    )
  },
})

export const tradingLimiter = rateLimit({
  windowMs: 1000,

  max: IS_DEMO ? 300 : 80,

  standardHeaders: true,
  legacyHeaders: false,

  handler: (_req, res) => {
    sendRateLimit(
      res,
      'Trading requests are moving too fast. Please slow down slightly.',
      5
    )
  },
})
