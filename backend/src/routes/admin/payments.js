// backend/src/routes/admin/payments.js
//
// Phase 4.5 / 04.5-02 / ADMIN-08 — admin payments endpoints.
//
// IMPORTANT: there is no Prisma `Payment` model. Payments are stored as
// Transaction rows with type='PAYMENT' (see backend/src/routes/payments.js
// where /api/payments POSTs to prisma.transaction.create with type='PAYMENT').
// Therefore the admin payment-status override updates a Transaction row.
// We keep the `/payments` URL surface for clarity in the admin SPA; it is a
// type-scoped view of Transaction.
//
// Auth chain mounted app-level in src/index.js — do NOT remount.

const express = require('express');
const auditLog = require('../../services/auditLog');
const { reqValidator } = require('../../middleware/reqValidator');
const { adminPaymentStatusSchema } = require('../../schemas/admin');
const { AppError } = require('../../errors/AppError');
const { logger } = require('../../logger');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/admin/payments — paged search of Transaction rows where type='PAYMENT'.
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const where = { type: 'PAYMENT' };
    if (req.query.userId) where.userId = String(req.query.userId);
    if (req.query.status) where.status = String(req.query.status);
    if (req.query.from || req.query.to) {
      where.createdAt = {};
      if (req.query.from) where.createdAt.gte = new Date(String(req.query.from));
      if (req.query.to) where.createdAt.lte = new Date(String(req.query.to));
    }

    const [items, total] = await Promise.all([
      req.prisma.transaction.findMany({
        where, orderBy: { createdAt: 'desc' }, skip, take: limit,
      }),
      req.prisma.transaction.count({ where }),
    ]);

    res.json({ items, total, page, limit });
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin payments list error');
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/payments/:id/status — override payment status with audit.
// Body: { status: string, reason: string (>=3) }
// Audit: PAYMENT_STATUS_OVERRIDE
// ---------------------------------------------------------------------------
router.post('/:id/status', reqValidator(adminPaymentStatusSchema), async (req, res, next) => {
  try {
    const id = req.params.id;
    const { status, reason } = req.validated;
    const result = await auditLog.withAudit(
      req.prisma,
      {
        actorId: req.userId,
        action: auditLog.AUDIT_ACTIONS.PAYMENT_STATUS_OVERRIDE,
        targetType: 'Transaction',
        targetId: id,
        requestId: req.id,
      },
      async (tx, setAudit) => {
        const before = await tx.transaction.findUnique({
          where: { id },
          select: { id: true, type: true, status: true, amount: true },
        });
        if (!before) throw new AppError('NOT_FOUND', 404);
        if (before.type !== 'PAYMENT') {
          throw new AppError('NOT_FOUND', 404);
        }
        const after = await tx.transaction.update({
          where: { id },
          data: { status },
          select: { id: true, type: true, status: true, amount: true },
        });
        setAudit({ before, after, reason });
        return after;
      }
    );
    res.json(result);
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin payment status override error');
    next(err);
  }
});

module.exports = router;
