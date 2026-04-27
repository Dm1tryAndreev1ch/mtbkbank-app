// backend/src/routes/admin/accounts.js
//
// Phase 4.5 / 04.5-02 / ADMIN-01 — admin BankAccount endpoints.
//
// Auth chain (authMiddleware → adminMiddleware → requireFreshAdmin →
// adminDestructiveLimiter) is mounted app-level in src/index.js. Sub-routers
// MUST NOT remount auth middleware (D-01 lock; pinned by regression-guard d).
//
// All mutating endpoints route through auditLog.withAudit() so writeAudit
// fires inside the same prisma.$transaction as the mutation. Pitfall 2 — we
// require the auditLog MODULE (not destructure) so Plan 6's rollback test
// can monkey-patch auditLog.writeAudit at runtime.

const express = require('express');
const auditLog = require('../../services/auditLog');
const { reqValidator } = require('../../middleware/reqValidator');
const {
  adminAccountFreezeSchema,
  adminAccountUnfreezeSchema,
  adminBalanceAdjustSchema,
} = require('../../schemas/admin');
const { AppError } = require('../../errors/AppError');
const { logger } = require('../../logger');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/admin/accounts — paged search.
// Query: ?page=1&limit=50&q=&userId=&frozen=true|false
// Response: { items, total, page, limit }
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const where = {};
    if (req.query.userId) where.userId = String(req.query.userId);
    if (req.query.q) {
      const q = String(req.query.q);
      where.OR = [
        { id: { contains: q } },
        { name: { contains: q, mode: 'insensitive' } },
        { type: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (req.query.frozen === 'true') where.frozen = true;
    else if (req.query.frozen === 'false') where.frozen = false;

    const [items, total] = await Promise.all([
      req.prisma.bankAccount.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      req.prisma.bankAccount.count({ where }),
    ]);

    res.json({ items, total, page, limit });
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin accounts list error');
    next(err);
  }
});

// GET /api/admin/accounts/by-user/:userId — list-by-user shortcut.
router.get('/by-user/:userId', async (req, res, next) => {
  try {
    const items = await req.prisma.bankAccount.findMany({
      where: { userId: req.params.userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ items, total: items.length, page: 1, limit: items.length });
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin accounts by-user error');
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/accounts/:id/freeze — set frozen=true with audit.
// Audit: ACCOUNT_FREEZE
// ---------------------------------------------------------------------------
router.post('/:id/freeze', reqValidator(adminAccountFreezeSchema), async (req, res, next) => {
  try {
    const id = req.params.id;
    const result = await auditLog.withAudit(
      req.prisma,
      {
        actorId: req.userId,
        action: auditLog.AUDIT_ACTIONS.ACCOUNT_FREEZE,
        targetType: 'BankAccount',
        targetId: id,
        requestId: req.id,
      },
      async (tx, setAudit) => {
        const before = await tx.bankAccount.findUnique({
          where: { id },
          select: { id: true, userId: true, frozen: true, balance: true },
        });
        if (!before) throw new AppError('NOT_FOUND', 404);
        const after = await tx.bankAccount.update({
          where: { id },
          data: { frozen: true },
          select: { id: true, userId: true, frozen: true, balance: true },
        });
        setAudit({ before, after, reason: req.validated.reason });
        return after;
      }
    );
    res.json(result);
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin account freeze error');
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/accounts/:id/unfreeze — set frozen=false with audit.
// Audit: ACCOUNT_UNFREEZE
// ---------------------------------------------------------------------------
router.post('/:id/unfreeze', reqValidator(adminAccountUnfreezeSchema), async (req, res, next) => {
  try {
    const id = req.params.id;
    const result = await auditLog.withAudit(
      req.prisma,
      {
        actorId: req.userId,
        action: auditLog.AUDIT_ACTIONS.ACCOUNT_UNFREEZE,
        targetType: 'BankAccount',
        targetId: id,
        requestId: req.id,
      },
      async (tx, setAudit) => {
        const before = await tx.bankAccount.findUnique({
          where: { id },
          select: { id: true, userId: true, frozen: true, balance: true },
        });
        if (!before) throw new AppError('NOT_FOUND', 404);
        const after = await tx.bankAccount.update({
          where: { id },
          data: { frozen: false },
          select: { id: true, userId: true, frozen: true, balance: true },
        });
        setAudit({ before, after, reason: req.validated.reason });
        return after;
      }
    );
    res.json(result);
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin account unfreeze error');
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/accounts/:id/balance-adjust — apply signed delta to balance.
// Body: { delta: number (finite), reason: string (>=3) }
// Audit: ACCOUNT_BALANCE_ADJUST
// ---------------------------------------------------------------------------
router.post('/:id/balance-adjust', reqValidator(adminBalanceAdjustSchema), async (req, res, next) => {
  try {
    const id = req.params.id;
    const { delta, reason } = req.validated;
    const result = await auditLog.withAudit(
      req.prisma,
      {
        actorId: req.userId,
        action: auditLog.AUDIT_ACTIONS.ACCOUNT_BALANCE_ADJUST,
        targetType: 'BankAccount',
        targetId: id,
        requestId: req.id,
      },
      async (tx, setAudit) => {
        const before = await tx.bankAccount.findUnique({
          where: { id },
          select: { id: true, userId: true, balance: true, frozen: true },
        });
        if (!before) throw new AppError('NOT_FOUND', 404);
        const after = await tx.bankAccount.update({
          where: { id },
          data: { balance: { increment: delta } },
          select: { id: true, userId: true, balance: true, frozen: true },
        });
        setAudit({ before, after, reason });
        return after;
      }
    );
    res.json(result);
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin account balance-adjust error');
    next(err);
  }
});

module.exports = router;
