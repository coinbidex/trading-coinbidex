import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/prisma';
import { cache } from '../utils/redis';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    status: string;
  };
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, message: 'No token provided' });

    // Check blacklist
    const blacklisted = await cache.get(`blacklist:${token}`);
    if (blacklisted) return res.status(401).json({ success: false, message: 'Token revoked' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;

    // Cache user to reduce DB calls
    let user = await cache.get<any>(`user:${decoded.userId}`);
    if (!user) {
      user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, email: true, role: true, status: true, username: true }
      });
      if (user) await cache.set(`user:${decoded.userId}`, user, 60);
    }

    if (!user) return res.status(401).json({ success: false, message: 'User not found' });
    if (user.status === 'BANNED' || user.status === 'SUSPENDED') {
      return res.status(403).json({ success: false, message: 'Account suspended' });
    }

    req.user = user;
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

export const requireRole = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }
    next();
  };
};

export const requireVerified = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' });
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user?.emailVerified) {
    return res.status(403).json({ success: false, message: 'Email not verified' });
  }
  next();
};

// Optional auth - doesn't fail if no token
export const optionalAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return next();
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, role: true, status: true }
    });
    req.user = user || undefined;
  } catch {}
  next();
};
