import { Response } from 'express';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { AuthRequest } from '../middleware/auth';

export const createTicket = async (req: AuthRequest, res: Response) => {
  try {
    const { subject, message, category, priority } = req.body;

    const ticket = await prisma.ticket.create({
      data: {
        userId: req.user!.id,
        subject,
        category,
        priority: priority || 'NORMAL',
        messages: { create: { authorId: req.user!.id, isAdmin: false, body: message } },
      },
      include: { messages: true },
    });

    res.status(201).json({ success: true, data: ticket });
  } catch (err) {
    logger.error('Create ticket error:', err);
    res.status(500).json({ success: false, message: 'Failed to create ticket' });
  }
};

export const getMyTickets = async (req: AuthRequest, res: Response) => {
  const tickets = await prisma.ticket.findMany({
    where: { userId: req.user!.id },
    include: { messages: { orderBy: { createdAt: 'asc' }, take: 1 } },
    orderBy: { updatedAt: 'desc' },
  });
  res.json({ success: true, data: tickets });
};

export const getTicket = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: 'asc' }, include: { author: { select: { username: true, role: true } } } },
      user: { select: { username: true, email: true } },
    },
  });
  if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
  if (ticket.userId !== req.user!.id && req.user!.role !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Not authorized' });
  }
  res.json({ success: true, data: ticket });
};

export const replyToTicket = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
    const isAdmin = req.user!.role === 'ADMIN';
    if (ticket.userId !== req.user!.id && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const reply = await prisma.ticketMessage.create({
      data: { ticketId: id, authorId: req.user!.id, isAdmin, body: message },
    });

    await prisma.ticket.update({
      where: { id },
      data: { status: isAdmin ? 'IN_PROGRESS' : 'OPEN', updatedAt: new Date() },
    });

    if (isAdmin) {
      await prisma.notification.create({
        data: {
          userId: ticket.userId,
          type: 'TICKET_REPLY',
          title: `Support replied: ${ticket.subject}`,
          message: message.slice(0, 140),
        }
      }).catch(() => {});
    }

    res.status(201).json({ success: true, data: reply });
  } catch (err) {
    logger.error('Reply to ticket error:', err);
    res.status(500).json({ success: false, message: 'Failed to reply' });
  }
};

export const closeTicket = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
  if (ticket.userId !== req.user!.id && req.user!.role !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Not authorized' });
  }
  await prisma.ticket.update({ where: { id }, data: { status: 'CLOSED' } });
  res.json({ success: true });
};

// Admin
export const getAllTicketsAdmin = async (req: AuthRequest, res: Response) => {
  const { status, page = 1, limit = 30 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);
  const where: any = {};
  if (status) where.status = status;

  const [tickets, total] = await prisma.$transaction([
    prisma.ticket.findMany({
      where,
      include: { user: { select: { username: true, email: true } } },
      orderBy: { updatedAt: 'desc' },
      skip, take: Number(limit),
    }),
    prisma.ticket.count({ where }),
  ]);

  res.json({ success: true, data: { tickets, pagination: { page: Number(page), limit: Number(limit), total } } });
};
