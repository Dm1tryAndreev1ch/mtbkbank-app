// backend/src/routes/admin/decks.js
//
// Phase 4.5 / 04.5-03 / ADMIN-05 — admin Deck endpoints.
//
// Endpoints (mounted at /api/admin/decks via admin/index.js):
//   GET   /by-user/:userId      list a user's decks
//   POST  /:id/break-active     deactivate the active deck (audit DECK_BREAK_ACTIVE)
//
// On next user-side decks read, ensureUserActiveDeck (if present) recreates a
// default deck. Auto-recreate is system behavior, not admin action — the
// auditable event is the admin's break-active call (T-04.5-03-05 disposition).
//
// Auth chain mounted app-level in src/index.js — do NOT remount here.

const express = require('express');
const auditLog = require('../../services/auditLog');
const { reqValidator } = require('../../middleware/reqValidator');
const { adminDeckBreakActiveSchema } = require('../../schemas/admin');
const { AppError } = require('../../errors/AppError');
const { logger } = require('../../logger');

const router = express.Router();

// GET /api/admin/decks/by-user/:userId — list a user's decks.
router.get('/by-user/:userId', async (req, res, next) => {
  try {
    const userId = String(req.params.userId);
    const items = await req.prisma.deck.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { deckCards: true } } },
    });
    res.json({ items, total: items.length });
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin decks by-user error');
    next(err);
  }
});

// POST /api/admin/decks/:id/break-active — deactivate the active deck.
router.post('/:id/break-active', reqValidator(adminDeckBreakActiveSchema), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const { reason } = req.validated;
    const result = await auditLog.withAudit(
      req.prisma,
      {
        actorId: req.userId,
        action: auditLog.AUDIT_ACTIONS.DECK_BREAK_ACTIVE,
        targetType: 'Deck',
        targetId: id,
        requestId: req.id,
        reason: reason || undefined,
      },
      async (tx, setAudit) => {
        const before = await tx.deck.findUnique({ where: { id } });
        if (!before) throw new AppError('NOT_FOUND', 404);
        const after = await tx.deck.update({
          where: { id },
          data: { isActive: false },
        });
        setAudit({ before, after });
        return after;
      }
    );
    res.json(result);
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin deck break-active error');
    next(err);
  }
});

module.exports = router;
