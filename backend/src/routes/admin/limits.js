// backend/src/routes/admin/limits.js
//
// Phase 4.5 / 04.5-02 / ADMIN-07 — admin SpendingLimit CRUD.
//
// IMPORTANT: Prisma model name is SpendingLimit (prisma.spendingLimit),
// NOT prisma[dot]limit. Plan 1 RESEARCH/SUMMARY reconciled this — the
// destructive-prisma ESLint rule + regression-guard pin spendingLimit as
// the durable selector.
//
// SpendingLimit fields per schema.prisma: { id, userId, category, limitAmount,
// spentAmount, period (String — 'DAILY'/'WEEKLY'/'MONTHLY' from admin Zod
// schema), createdAt }. Admin Zod schema uses `amount` for limitAmount; we
// remap before writing to Prisma.
//
// Auth chain mounted app-level in src/index.js — do NOT remount.

const express = require('express');
const auditLog = require('../../services/auditLog');
const { reqValidator } = require('../../middleware/reqValidator');
const {
  adminLimitCreateSchema,
  adminLimitUpdateSchema,
} = require('../../schemas/admin');
const { AppError } = require('../../errors/AppError');
const { logger } = require('../../logger');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/admin/limits — paged list.
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const where = {};
    if (req.query.userId) where.userId = String(req.query.userId);
    if (req.query.category) where.category = String(req.query.category);

    const [items, total] = await Promise.all([
      req.prisma.spendingLimit.findMany({
        where, orderBy: { createdAt: 'desc' }, skip, take: limit,
      }),
      req.prisma.spendingLimit.count({ where }),
    ]);

    res.json({ items, total, page, limit });
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin limits list error');
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/limits — create. Audit: LIMIT_CREATE.
// ---------------------------------------------------------------------------
router.post('/', reqValidator(adminLimitCreateSchema), async (req, res, next) => {
  try {
    const { userId, category, amount, period } = req.validated;
    const result = await auditLog.withAudit(
      req.prisma,
      {
        actorId: req.userId,
        action: auditLog.AUDIT_ACTIONS.LIMIT_CREATE,
        targetType: 'SpendingLimit',
        requestId: req.id,
      },
      async (tx, setAudit) => {
        const created = await tx.spendingLimit.create({
          data: { userId, category, limitAmount: amount, period },
        });
        setAudit({ targetId: created.id, before: null, after: created });
        return created;
      }
    );
    res.json(result);
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin limit create error');
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PUT /api/admin/limits/:id — update. Audit: LIMIT_UPDATE.
// ---------------------------------------------------------------------------
router.put('/:id', reqValidator(adminLimitUpdateSchema), async (req, res, next) => {
  try {
    const id = req.params.id;
    const data = {};
    if (req.validated.category !== undefined) data.category = req.validated.category;
    if (req.validated.amount !== undefined) data.limitAmount = req.validated.amount;
    if (req.validated.period !== undefined) data.period = req.validated.period;

    const result = await auditLog.withAudit(
      req.prisma,
      {
        actorId: req.userId,
        action: auditLog.AUDIT_ACTIONS.LIMIT_UPDATE,
        targetType: 'SpendingLimit',
        targetId: id,
        requestId: req.id,
      },
      async (tx, setAudit) => {
        const before = await tx.spendingLimit.findUnique({ where: { id } });
        if (!before) throw new AppError('NOT_FOUND', 404);
        const after = await tx.spendingLimit.update({ where: { id }, data });
        setAudit({ before, after });
        return after;
      }
    );
    res.json(result);
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin limit update error');
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/limits/:id — hard delete. Audit: LIMIT_DELETE.
// (D-02 allowlist permits prisma.spendingLimit.delete inside routes/admin/**.)
// ---------------------------------------------------------------------------
router.delete('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const result = await auditLog.withAudit(
      req.prisma,
      {
        actorId: req.userId,
        action: auditLog.AUDIT_ACTIONS.LIMIT_DELETE,
        targetType: 'SpendingLimit',
        targetId: id,
        requestId: req.id,
      },
      async (tx, setAudit) => {
        const before = await tx.spendingLimit.findUnique({ where: { id } });
        if (!before) throw new AppError('NOT_FOUND', 404);
        await tx.spendingLimit.delete({ where: { id } });
        setAudit({ before, after: null });
        return { id, deleted: true };
      }
    );
    res.json(result);
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin limit delete error');
    next(err);
  }
});

module.exports = router;
