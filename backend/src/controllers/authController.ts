import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import { prisma } from '../utils/prisma'
import { cache } from '../utils/redis'
import { logger } from '../utils/logger'
import { AuthRequest } from '../middleware/auth'
import { sendEmail, emailVerification, emailPasswordReset, emailLoginAlert } from '../services/emailService'
import { platformConfig } from '../services/platformMode'

const BASE_URL = process.env.FRONTEND_URL || 'http://localhost:3000'
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_in_production'
const JWT_REFRESH = process.env.JWT_REFRESH_SECRET || 'dev_refresh_change_in_production'

function generateTokens(userId: string) {
  const accessToken = jwt.sign(
    { userId, type: 'access' },
    JWT_SECRET,
    { expiresIn: '15m', algorithm: 'HS256' }
  )
  const refreshToken = jwt.sign(
    { userId, type: 'refresh', jti: uuidv4() },
    JWT_REFRESH,
    { expiresIn: '30d', algorithm: 'HS256' }
  )
  return { accessToken, refreshToken }
}

// The trading app (trade.coinbidex.com) is the source of truth for auth.
// The marketing site (coinbidex.com) needs to know *whether* someone is
// logged in and their basic display info (name/avatar) — without ever
// having direct access to the access/refresh tokens themselves, which stay
// in the trading app's own storage only.
//
// We do this with a separate, minimal, httpOnly cookie scoped to the shared
// parent domain (.coinbidex.com) so both subdomains receive it. It carries
// only a userId claim, nothing else — it cannot be used to call any
// authenticated trading-app endpoint on its own.
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined // e.g. ".coinbidex.com" in production
const SESSION_COOKIE = 'cb_session'

function setCrossSiteSessionCookie(res: Response, userId: string) {
  const sessionToken = jwt.sign({ userId, type: 'session_display' }, JWT_SECRET, { expiresIn: '30d', algorithm: 'HS256' })
  res.cookie(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',       // required for coinbidex.com's cross-origin fetch to receive it
    domain: COOKIE_DOMAIN,  // undefined in dev = falls back to host-only cookie, still fine
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  })
}

function clearCrossSiteSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { domain: COOKIE_DOMAIN, path: '/' })
}

// ── Register ──────────────────────────────────────────────────
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, username, password, referralCode } = req.body

    if (!email || !username || !password) {
      res.status(400).json({ success: false, message: 'Email, username and password are required' })
      return
    }

    const exists = await prisma.user.findFirst({
      where: { OR: [{ email: email.toLowerCase() }, { username: username.toLowerCase() }] }
    })

    if (exists) {
      const field = exists.email === email.toLowerCase() ? 'Email' : 'Username'
      res.status(409).json({ success: false, message: `${field} already taken` })
      return
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const emailVerifyToken = uuidv4()

    const user = await prisma.user.create({
      data: {
        email:            email.toLowerCase(),
        username:         username.toLowerCase(),
        passwordHash,
        emailVerifyToken,
        emailVerified:    platformConfig.isDemo, // auto-verify on demo
        referredBy:       referralCode || null,
        status:           'ACTIVE',
      }
    })

    // Create wallets for default assets
    const assets = await prisma.asset.findMany({
      where: { symbol: { in: ['BTC','ETH','USDT','BNB','SOL','MATIC','LINK','AVAX','ADA','DOT','XRP','UNI'] } }
    })
    if (assets.length > 0) {
      await prisma.wallet.createMany({
        data: assets.map(a => ({ userId: user.id, assetId: a.id, balance: 0 })),
        skipDuplicates: true,
      })
    }

    // Demo: auto-grant paper funds
    if (platformConfig.autoGrantDemoFunds) {
      const demoBalances: Record<string, number> = {
        USDT: 100000, BTC: 2, ETH: 20, BNB: 50, SOL: 200,
        MATIC: 5000, LINK: 500, AVAX: 100, ADA: 10000, DOT: 500,
      }
      for (const asset of assets) {
        const bal = demoBalances[asset.symbol]
        if (bal) {
          await prisma.wallet.updateMany({
            where: { userId: user.id, assetId: asset.id },
            data: { balance: bal }
          })
        }
      }
    }

    // Send verification email (live only)
    if (platformConfig.requireEmailVerification) {
      const tpl = emailVerification(user.username, emailVerifyToken, BASE_URL)
      sendEmail(user.email, tpl.subject, tpl.html).catch(err =>
        logger.error('Verification email failed:', err)
      )
    }

    

    logger.info(`New user registered: ${user.email} [${platformConfig.mode}]`)

    const { accessToken, refreshToken } = generateTokens(user.id)

    await prisma.session.create({
      data: {
        userId:    user.id,
        token:     accessToken,
        refreshToken,
        ipAddress: req.ip || '',
        userAgent: req.headers['user-agent'] || '',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }
    })

    setCrossSiteSessionCookie(res, user.id)

    res.status(201).json({
      success: true,
      message: platformConfig.isDemo
        ? 'Demo account created! You have $100,000 in paper funds to trade with.'
        : 'Account created! Check your email to verify.',
      data: {
        user: {
          id: user.id, email: user.email, username: user.username,
          role: user.role, emailVerified: user.emailVerified,
          kycStatus: user.kycStatus, referralCode: user.referralCode,
          avatarUrl: user.avatarUrl ?? null,
        },
        accessToken,
        refreshToken,
      }
    })
  } catch (err) {
    logger.error('Register error:', err)
    res.status(500).json({ success: false, message: 'Registration failed. Please try again.' })
  }
}

// ── Login ─────────────────────────────────────────────────────
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      res.status(400).json({ success: false, message: 'Email and password are required' })
      return
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })

    // Timing-safe: always hash even on miss
    
    const hashToCompare = user?.passwordHash ?? '$2b$12$invalidhashfortimingsafety0000000000000000'
    
    const valid = await bcrypt.compare(password, hashToCompare)

    if (!user || !valid) {
      res.status(401).json({ success: false, message: 'Invalid email or password' })
      return
    }

    if (user.status === 'BANNED') {
      res.status(403).json({ success: false, message: 'Account has been banned' })
      return
    }
    if (user.status === 'SUSPENDED') {
      res.status(403).json({ success: false, message: 'Account is suspended' })
      return
    }

    const { accessToken, refreshToken } = generateTokens(user.id)

    await prisma.session.create({
      data: {
        userId:    user.id,
        token:     accessToken,
        refreshToken,
        ipAddress: req.ip || '',
        userAgent: req.headers['user-agent'] || '',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }
    })

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastLoginIp: req.ip || '' }
    })

    await cache.del(`user:${user.id}`)

    setCrossSiteSessionCookie(res, user.id)

    // Login alert email (live only)
    if (platformConfig.sendLoginAlerts && user.emailVerified) {
      const tpl = emailLoginAlert(user.username, req.ip || 'unknown', new Date().toUTCString())
      sendEmail(user.email, tpl.subject, tpl.html).catch(() => {})
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user.id, email: user.email, username: user.username,
          role: user.role, kycStatus: user.kycStatus,
          emailVerified: user.emailVerified,
          twoFactorEnabled: user.twoFactorEnabled,
          referralCode: user.referralCode,
          avatarUrl: user.avatarUrl ?? null,
        },
        accessToken,
        refreshToken,
      }
    })
  } catch (err) {
    logger.error('Login error:', err)
    res.status(500).json({ success: false, message: 'Login failed. Please try again.' })
  }
}

// ── Refresh token ─────────────────────────────────────────────
export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken: token } = req.body
    if (!token) {
      res.status(400).json({ success: false, message: 'Refresh token required' })
      return
    }

    let decoded: any
    try {
      decoded = jwt.verify(token, JWT_REFRESH, { algorithms: ['HS256'] })
    } catch {
      res.status(401).json({ success: false, message: 'Invalid or expired refresh token' })
      return
    }

    if (decoded.type !== 'refresh') {
      res.status(401).json({ success: false, message: 'Invalid token type' })
      return
    }

    const session = await prisma.session.findUnique({ where: { refreshToken: token } })
    if (!session || session.expiresAt < new Date()) {
      res.status(401).json({ success: false, message: 'Session expired. Please log in again.' })
      return
    }

    const { accessToken, refreshToken: newRefresh } = generateTokens(decoded.userId)

    await prisma.session.update({
      where: { id: session.id },
      data: {
        token: accessToken,
        refreshToken: newRefresh,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }
    })

    setCrossSiteSessionCookie(res, decoded.userId)

    res.json({ success: true, data: { accessToken, refreshToken: newRefresh } })
  } catch (err) {
    logger.error('Refresh error:', err)
    res.status(401).json({ success: false, message: 'Token refresh failed' })
  }
}

// ── Logout ────────────────────────────────────────────────────
export const logout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (token) {
      await cache.set(`blacklist:${token}`, '1', 900)
      await prisma.session.deleteMany({ where: { token } })
    }
    clearCrossSiteSessionCookie(res)
    res.json({ success: true, message: 'Logged out successfully' })
  } catch (err) {
    logger.error('Logout error:', err)
    res.status(500).json({ success: false, message: 'Logout failed' })
  }
}

// ── Cross-site session status (called by coinbidex.com) ────────
// Public endpoint — reads the httpOnly cb_session cookie (not the
// Authorization header) and returns only what the marketing site needs to
// render "logged in" state: display name and avatar. Never returns tokens.
export const sessionStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.cookies?.[SESSION_COOKIE]
    if (!token) {
      res.json({ success: true, data: { loggedIn: false } })
      return
    }

    let decoded: any
    try {
      decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })
    } catch {
      res.json({ success: true, data: { loggedIn: false } })
      return
    }

    if (decoded.type !== 'session_display') {
      res.json({ success: true, data: { loggedIn: false } })
      return
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, username: true, avatarUrl: true, status: true },
    })

    if (!user || user.status !== 'ACTIVE') {
      res.json({ success: true, data: { loggedIn: false } })
      return
    }

    res.json({
      success: true,
      data: {
        loggedIn: true,
        user: { username: user.username, avatarUrl: user.avatarUrl ?? null },
      },
    })
  } catch (err) {
    logger.error('Session status error:', err)
    res.json({ success: true, data: { loggedIn: false } })
  }
}

// ── Verify email ──────────────────────────────────────────────
export const verifyEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.query
    if (!token || typeof token !== 'string') {
      res.status(400).json({ success: false, message: 'Verification token required' })
      return
    }

    const user = await prisma.user.findFirst({ where: { emailVerifyToken: token } })
    if (!user) {
      res.status(400).json({ success: false, message: 'Invalid or expired verification link' })
      return
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerifyToken: null }
    })

    res.json({ success: true, message: 'Email verified! You can now sign in.' })
  } catch (err) {
    logger.error('Email verify error:', err)
    res.status(500).json({ success: false, message: 'Verification failed' })
  }
}

// ── Forgot password ───────────────────────────────────────────
export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body
    if (!email) {
      res.status(400).json({ success: false, message: 'Email required' })
      return
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })

    // Always return same message to prevent email enumeration
    const msg = 'If that email exists, a reset link has been sent.'

    if (!user) {
      res.json({ success: true, message: msg })
      return
    }

    const token = uuidv4()
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken:  token,
        resetPasswordExpiry: new Date(Date.now() + 3600000), // 1 hour
      }
    })

    const tpl = emailPasswordReset(user.username, token, BASE_URL)
    await sendEmail(user.email, tpl.subject, tpl.html)

    res.json({ success: true, message: msg })
  } catch (err) {
    logger.error('Forgot password error:', err)
    res.status(500).json({ success: false, message: 'Failed to send reset email' })
  }
}

// ── Reset password ────────────────────────────────────────────
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, password } = req.body
    if (!token || !password) {
      res.status(400).json({ success: false, message: 'Token and new password required' })
      return
    }

    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken:  token,
        resetPasswordExpiry: { gt: new Date() },
      }
    })

    if (!user) {
      res.status(400).json({ success: false, message: 'Invalid or expired reset link' })
      return
    }

    const passwordHash = await bcrypt.hash(password, 12)
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetPasswordToken: null, resetPasswordExpiry: null }
    })

    // Invalidate all sessions
    await prisma.session.deleteMany({ where: { userId: user.id } })

    res.json({ success: true, message: 'Password reset. Please sign in with your new password.' })
  } catch (err) {
    logger.error('Reset password error:', err)
    res.status(500).json({ success: false, message: 'Password reset failed' })
  }
}

// ── Get current user ──────────────────────────────────────────
export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true, email: true, username: true, firstName: true, lastName: true,
        phone: true, country: true, avatarUrl: true, role: true, status: true,
        kycStatus: true, twoFactorEnabled: true, emailVerified: true,
        referralCode: true, createdAt: true, lastLoginAt: true,
        wallets: {
          include: {
            asset: { select: { symbol: true, name: true, logoUrl: true, decimals: true } }
          },
          orderBy: { balance: 'desc' }
        }
      }
    })

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' })
      return
    }

    res.json({ success: true, data: user })
  } catch (err) {
    logger.error('Get me error:', err)
    res.status(500).json({ success: false, message: 'Failed to get user data' })
  }
}


// ── Resend Verification Email ─────────────────────────────────
export const resendVerificationEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body

    if (!email) {
      res.status(400).json({
        success: false,
        message: 'Email is required'
      })
      return
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    })

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      })
      return
    }

    if (user.emailVerified) {
      res.status(400).json({
        success: false,
        message: 'Email already verified'
      })
      return
    }

    const token = uuidv4()

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerifyToken: token }
    })

    const tpl = emailVerification(user.username, token, BASE_URL)

    await sendEmail(user.email, tpl.subject, tpl.html)

    res.json({
      success: true,
      message: 'Verification email sent successfully'
    })
  } catch (err) {
    logger.error('Resend verification error:', err)

    res.status(500).json({
      success: false,
      message: 'Failed to resend verification email'
    })
  }
}
