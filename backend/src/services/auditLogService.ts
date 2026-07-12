import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';

// One row per meaningful admin action. Call this anywhere an admin
// approves/rejects/marks something paid — gives a real, permanent trail
// instead of relying on log files that roll off after a few days.
export async function logAdminAction(params: {
  adminId: string;
  action: string;       // e.g. "invoice.mark_paid", "listing.approve"
  entityType: string;   // "Invoice" | "Listing" | "Advertisement" | "Ticket"
  entityId: string;
  metadata?: Record<string, any>;
}) {
  try {
    await prisma.adminAuditLog.create({
      data: {
        adminId: params.adminId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        metadata: params.metadata ?? undefined,
      },
    });
  } catch (err) {
    // Never let audit logging itself break the admin action it's logging
    logger.error('Failed to write admin audit log:', err);
  }
}
