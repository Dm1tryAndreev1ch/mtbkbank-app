// backend/src/routes/admin/subscriptions.js
//
// Phase 4.5 / 04.5-02 / ADMIN-09 — admin Subscription CRUD.
//
// Schema fields (per backend/prisma/schema.prisma):
//   { id, userId, name, icon, amount Float, currency, category, nextPayment,
//     isActive, createdAt }
// Required at create: userId, name, icon, amount, nextPayment.
// We default icon to 'subscriptions' and nextPayment to (now + 30 days) if
// the admin Zod payload omits them — Plan 1 scaffold under-specified.
//
// Auth chain mounted app-level in src/index.js — do NOT remount.

const express = require('express');
const auditLog = require('../../services/auditLog');
const { reqValidator } = require('../../middleware/reqValidator');
const {
  adminSubscriptionCreateSchema,
  adminSubscriptionUpdateSchema,
} = require('../../schemas/admin');
const { AppError } = require('../../errors/AppError');
const { logger } = require('../../logger');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const where = {};
    if (req.query.userId) where.userId = String(req.query.userId);
    if (req.query.isActive === 'true') where.isActive = true;
    else if (req.query.isActive === 'false') where.isActive = false;

    const [items, total] = await Promise.all([
      req.prisma.subscription.findMany({
        where, orderBy: { createdAt: 'desc' }, skip, take: limit,
      }),
      req.prisma.subscription.count({ where }),
    ]);

    res.json({ items, total, page, limit });
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin subscriptions list error');
    next(err);
  }
});

router.post('/', reqValidator(adminSubscriptionCreateSchema), async (req, res, next) => {
  try {
    const { userId, name, amount, icon, category, nextPayment } = req.validated;
    const data = {
      userId,
      name,
      amount,
      icon: icon || 'subscriptions',
      nextPayment: nextPayment ? new Date(nextPayment) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    };
    if (category) data.category = category;

    const result = await auditLog.withAudit(
      req.prisma,
      {
        actorId: req.userId,
        action: auditLog.AUDIT_ACTIONS.SUBSCRIPTION_CREATE,
        targetType: 'Subscription',
        requestId: req.id,
      },
      async (tx, setAudit) => {
        const created = await tx.subscription.create({ data });
        setAudit({ targetId: created.id, before: null, after: created });
        return created;
      }
    );
    res.json(result);
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin subscription create error');
    next(err);
  }
});

router.put('/:id', reqValidator(adminSubscriptionUpdateSchema), async (req, res, next) => {
  try {
    const id = req.params.id;
    const data = {};
    if (req.validated.name !== undefined) data.name = req.validated.name;
    if (req.validated.amount !== undefined) data.amount = req.validated.amount;
    if (req.validated.icon !== undefined) data.icon = req.validated.icon;
    if (req.validated.category !== undefined) data.category = req.validated.category;
    if (req.validated.nextPayment !== undefined) data.nextPayment = new Date(req.validated.nextPayment);

    const result = await auditLog.withAudit(
      req.prisma,
      {
        actorId: req.userId,
        action: auditLog.AUDIT_ACTIONS.SUBSCRIPTION_UPDATE,
        targetType: 'Subscription',
        targetId: id,
        requestId: req.id,
      },
      async (tx, setAudit) => {
        const before = await tx.subscription.findUnique({ where: { id } });
        if (!before) throw new AppError('NOT_FOUND', 404);
        const after = await tx.subscription.update({ where: { id }, data });
        setAudit({ before, after });
        return after;
      }
    );
    res.json(result);
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin subscription update error');
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const result = await auditLog.withAudit(
      req.prisma,
      {
        actorId: req.userId,
        action: auditLog.AUDIT_ACTIONS.SUBSCRIPTION_DELETE,
        targetType: 'Subscription',
        targetId: id,
        requestId: req.id,
      },
      async (tx, setAudit) => {
        const before = await tx.subscription.findUnique({ where: { id } });
        if (!before) throw new AppError('NOT_FOUND', 404);
        await tx.subscription.delete({ where: { id } });
        setAudit({ before, after: null });
        return { id, deleted: true };
      }
    );
    res.json(result);
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin subscription delete error');
    next(err);
  }
});

module.exports = router;
