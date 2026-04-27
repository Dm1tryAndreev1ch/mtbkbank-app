// backend/src/routes/admin/trades.js
//
// Phase 4.5 / 04.5-04 / ADMIN-11 — admin trades list + cancel.
//
// GET  /api/admin/trades?page=&limit=&status=&userId=&from=&to=
//   Server-side pagination + filters. Returns { items, total, page, limit }.
// POST /api/admin/trades/:id/cancel
//   Only PENDING trades are cancellable; everything else returns 409
//   TRADE_NOT_CANCELLABLE. Audit code TRADE_CANCEL.
//
// IDOR mitigation (T-04.5-04-04): :id is read from req.params ONLY. The body
// schema (adminTradeCancelSchema) contains only an optional `reason`; no id
// field. AuditLog targetId comes from req.params.id.
//
// Auth chain mounted app-level — do NOT remount middleware here.
// Sub-router import convention (Pitfall 2): require auditLog MODULE so the
// rollback regression test can monkey-patch writeAudit at runtime.

const express = require('express');
const auditLog = require('../../services/auditLog');
const { reqValidator } = require('../../middleware/reqValidator');
const { adminTradeCancelSchema } = require('../../schemas/admin');
const { AppError } = require('../../errors/AppError');
const { logger } = require('../../logger');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET / — paged trade list with optional filters.
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const page  = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const skip  = (page - 1) * limit;

    const where = {};
    if (req.query.status)  where.status = String(req.query.status);
    if (req.query.userId) {
      const uid = String(req.query.userId);
      where.OR = [{ fromUserId: uid }, { toUserId: uid }];
    }
    if (req.query.from || req.query.to) {
      where.createdAt = {};
      if (req.query.from) where.createdAt.gte = new Date(String(req.query.from));
      if (req.query.to)   where.createdAt.lte = new Date(String(req.query.to));
    }

    const [items, total] = await Promise.all([
      req.prisma.cardTrade.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          fromUser: { select: { id: true, name: true } },
          toUser:   { select: { id: true, name: true } },
        },
      }),
      req.prisma.cardTrade.count({ where }),
    ]);

    res.json({ items, total, page, limit });
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin trades list error');
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /:id/cancel — cancel a PENDING trade with audit.
// ---------------------------------------------------------------------------
router.post('/:id/cancel', reqValidator(adminTradeCancelSchema), async (req, res, next) => {
  try {
    const id = req.params.id; // URL only — IDOR mitigation T-04.5-04-04.
    const { reason } = req.validated;
    const result = await auditLog.withAudit(
      req.prisma,
      {
        actorId: req.userId,
        action: auditLog.AUDIT_ACTIONS.TRADE_CANCEL,
        targetType: 'CardTrade',
        targetId: id,
        requestId: req.id,
      },
      async (tx, setAudit) => {
        const before = await tx.cardTrade.findUnique({
          where: { id },
          select: { id: true, status: true, fromUserId: true, toUserId: true },
        });
        if (!before) throw new AppError('NOT_FOUND', 404);
        if (before.status !== 'PENDING') {
          throw new AppError('TRADE_NOT_CANCELLABLE', 409);
        }
        const after = await tx.cardTrade.update({
          where: { id },
          data: { status: 'CANCELLED' },
          select: { id: true, status: true, fromUserId: true, toUserId: true },
        });
        setAudit({ before, after, reason });
        return after;
      }
    );
    res.json(result);
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin trade cancel error');
    next(err);
  }
});

module.exports = router;
