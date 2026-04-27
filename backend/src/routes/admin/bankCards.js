// backend/src/routes/admin/bankCards.js
//
// Phase 4.5 / 04.5-03 / ADMIN-03 — admin BankCard CRUD.
//
// Endpoints (mounted at /api/admin/bankCards via admin/index.js):
//   GET    /                paged list (filter by userId)
//   POST   /                force-issue a new BankCard for a user
//   POST   /:id/block       set isActive=false  (audit BANKCARD_BLOCK)
//   POST   /:id/unblock     set isActive=true   (audit BANKCARD_UNBLOCK)
//   DELETE /:id             hard delete         (audit BANKCARD_DELETE)
//
// BankCard schema (prisma): { id, userId, accountId, maskedNumber, type, tier,
// isActive, createdAt }. The Plan-1 scaffold of adminBankCardIssueSchema
// originally had a `cardType` field that doesn't exist on the model — corrected
// in schemas/admin.js to { userId, accountId, type, tier, maskedNumber? }
// (deviation Rule 3, anticipated by Plan 3 prompt).
//
// Auth chain mounted app-level in src/index.js — do NOT remount here.

const express = require('express');
const auditLog = require('../../services/auditLog');
const { reqValidator } = require('../../middleware/reqValidator');
const {
  adminBankCardBlockSchema,
  adminBankCardIssueSchema,
} = require('../../schemas/admin');
const { AppError } = require('../../errors/AppError');
const { logger } = require('../../logger');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/admin/bankCards — paged list. Optional filter ?userId=.
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const where = {};
    if (req.query.userId) where.userId = String(req.query.userId);

    const [items, total] = await Promise.all([
      req.prisma.bankCard.findMany({
        where, orderBy: { createdAt: 'desc' }, skip, take: limit,
      }),
      req.prisma.bankCard.count({ where }),
    ]);
    res.json({ items, total, page, limit });
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin bankCards list error');
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/bankCards — force-issue a card.
// Cross-checks accountId.userId === body.userId (T-04.5-03-04 mitigation).
// Audit: BANKCARD_ISSUE.
// ---------------------------------------------------------------------------
router.post('/', reqValidator(adminBankCardIssueSchema), async (req, res, next) => {
  try {
    const { userId, accountId, type, tier, maskedNumber } = req.validated;

    const account = await req.prisma.bankAccount.findUnique({
      where: { id: accountId },
      select: { id: true, userId: true },
    });
    if (!account) {
      throw new AppError('VALIDATION_FAILED', 400, 'Счёт не найден');
    }
    if (account.userId !== userId) {
      throw new AppError('VALIDATION_FAILED', 400, 'Счёт принадлежит другому пользователю');
    }

    // Synthesize a masked number when admin omits it: 4 random digits.
    const synthMasked = maskedNumber
      || `**** ${Math.floor(1000 + Math.random() * 9000)}`;

    const created = await auditLog.withAudit(
      req.prisma,
      {
        actorId: req.userId,
        action: auditLog.AUDIT_ACTIONS.BANKCARD_ISSUE,
        targetType: 'BankCard',
        requestId: req.id,
      },
      async (tx, setAudit) => {
        const card = await tx.bankCard.create({
          data: {
            userId,
            accountId,
            type,
            tier,
            maskedNumber: synthMasked,
            isActive: true,
          },
        });
        setAudit({ targetId: card.id, before: null, after: card });
        return card;
      }
    );
    res.json(created);
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin bankCard issue error');
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/bankCards/:id/block — set isActive=false.
// Audit: BANKCARD_BLOCK.
// ---------------------------------------------------------------------------
router.post('/:id/block', reqValidator(adminBankCardBlockSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.validated;
    const result = await auditLog.withAudit(
      req.prisma,
      {
        actorId: req.userId,
        action: auditLog.AUDIT_ACTIONS.BANKCARD_BLOCK,
        targetType: 'BankCard',
        targetId: id,
        requestId: req.id,
        reason: reason || undefined,
      },
      async (tx, setAudit) => {
        const before = await tx.bankCard.findUnique({ where: { id } });
        if (!before) throw new AppError('NOT_FOUND', 404);
        const after = await tx.bankCard.update({
          where: { id },
          data: { isActive: false },
        });
        setAudit({ before, after });
        return after;
      }
    );
    res.json(result);
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin bankCard block error');
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/bankCards/:id/unblock — set isActive=true.
// Audit: BANKCARD_UNBLOCK.
// ---------------------------------------------------------------------------
router.post('/:id/unblock', reqValidator(adminBankCardBlockSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.validated;
    const result = await auditLog.withAudit(
      req.prisma,
      {
        actorId: req.userId,
        action: auditLog.AUDIT_ACTIONS.BANKCARD_UNBLOCK,
        targetType: 'BankCard',
        targetId: id,
        requestId: req.id,
        reason: reason || undefined,
      },
      async (tx, setAudit) => {
        const before = await tx.bankCard.findUnique({ where: { id } });
        if (!before) throw new AppError('NOT_FOUND', 404);
        const after = await tx.bankCard.update({
          where: { id },
          data: { isActive: true },
        });
        setAudit({ before, after });
        return after;
      }
    );
    res.json(result);
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin bankCard unblock error');
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/bankCards/:id — hard delete.
// (D-02 allowlist permits prisma.bankCard.delete inside routes/admin/**.)
// Audit: BANKCARD_DELETE.
// ---------------------------------------------------------------------------
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await auditLog.withAudit(
      req.prisma,
      {
        actorId: req.userId,
        action: auditLog.AUDIT_ACTIONS.BANKCARD_DELETE,
        targetType: 'BankCard',
        targetId: id,
        requestId: req.id,
      },
      async (tx, setAudit) => {
        const before = await tx.bankCard.findUnique({ where: { id } });
        if (!before) throw new AppError('NOT_FOUND', 404);
        await tx.bankCard.delete({ where: { id } });
        setAudit({ before, after: null });
        return { id, deleted: true };
      }
    );
    res.json(result);
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin bankCard delete error');
    next(err);
  }
});

module.exports = router;
