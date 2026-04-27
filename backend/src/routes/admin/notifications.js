// backend/src/routes/admin/notifications.js
//
// Phase 4.5 / 04.5-04 / ADMIN-10 — admin notification broadcast.
//
// POST /api/admin/notifications/broadcast
//   audience.type='USER'    — single user broadcast (audience.userId)
//   audience.type='SEGMENT' — segment broadcast (audience.segment='GOLD' only in v1.0)
//
// Notification rows are created inside the SAME prisma.$transaction as the
// AuditLog row via auditLog.withAudit. Push fan-out runs POST-COMMIT so a
// transient Expo upstream failure does NOT roll back durable Notification
// rows (T-04.5-04-03).
//
// Auth chain (authMiddleware → adminMiddleware → requireFreshAdmin →
// adminDestructiveLimiter) is mounted app-level in src/index.js — do NOT
// remount middleware here. Sub-router import convention (Pitfall 2): require
// the auditLog MODULE, not destructure, so the rollback regression test can
// monkey-patch writeAudit at runtime.

const express = require('express');
const auditLog = require('../../services/auditLog');
const { reqValidator } = require('../../middleware/reqValidator');
const { adminNotificationBroadcastSchema } = require('../../schemas/admin');
const { AppError } = require('../../errors/AppError');
const { logger } = require('../../logger');
const pushNotifications = require('../../push');

const router = express.Router();

// ---------------------------------------------------------------------------
// POST /broadcast — broadcast a notification to a single user OR the GOLD segment.
// ---------------------------------------------------------------------------
router.post('/broadcast', reqValidator(adminNotificationBroadcastSchema), async (req, res, next) => {
  try {
    const { audience, title, body, data } = req.validated;

    const recipients = await auditLog.withAudit(
      req.prisma,
      {
        actorId: req.userId,
        action: auditLog.AUDIT_ACTIONS.NOTIFICATION_BROADCAST,
        targetType: 'Notification',
        targetId: null,
        requestId: req.id,
      },
      async (tx, setAudit) => {
        // Resolve recipients inside the tx so the AuditLog payload reflects
        // the exact rows we will write Notification entries for.
        const where = audience.type === 'USER'
          ? { id: audience.userId, deletedAt: null }
          : { status: 'GOLD', deletedAt: null };
        const found = await tx.user.findMany({
          where,
          select: { id: true, expoPushToken: true },
        });
        if (found.length === 0) {
          throw new AppError('NOTIFICATION_NO_RECIPIENTS', 404);
        }

        // Persist Notification rows BEFORE the push fan-out — durable record
        // first, fire-and-forget push afterwards.
        await tx.notification.createMany({
          data: found.map((r) => ({ userId: r.id, title, body })),
        });

        setAudit({
          before: null,
          after: {
            audience,
            recipientCount: found.length,
            title,
            body,
          },
        });
        return found;
      }
    );

    // Post-commit push fan-out. A transient Expo failure does NOT roll back
    // the durable Notification rows. ok/error counts are surfaced to the
    // admin Toast so partial failure is observable.
    const tickets = await pushNotifications.sendBroadcast(recipients, { title, body, data });
    res.json({ recipientCount: recipients.length, ok: tickets.ok, error: tickets.error });
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin notifications broadcast error');
    next(err);
  }
});

module.exports = router;
