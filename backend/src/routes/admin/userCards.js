// backend/src/routes/admin/userCards.js
//
// Phase 4.5 / 04.5-01 / D-01 — userCards sub-router. Plan 3 (Cards cluster)
// fills this with grant/revoke/HP-edit endpoints. Plan 1 migrates the existing
// /admin/grant-card endpoint here as `grantCardHandler` and re-exports it so
// admin/index.js can keep the legacy `/api/admin/grant-card` URL working.
//
// Auth chain mounted app-level in src/index.js — do NOT remount here.

const express = require('express');
const auditLog = require('../../services/auditLog');
const { reqValidator } = require('../../middleware/reqValidator');
const {
  adminGrantCardSchema,
  adminUserCardHpSchema,
} = require('../../schemas/admin');
const { AppError } = require('../../errors/AppError');
const { logger } = require('../../logger');

const router = express.Router();

// POST /api/admin/grant-card — Phase 3 / 03-10 / SEC-14
// Phase 4.5 / 04.5-01 / D-03 — rewrapped with auditLog.withAudit.
const grantCardHandler = [
  reqValidator(adminGrantCardSchema),
  async (req, res, next) => {
    try {
      // Phase 4 / 04-02 / B-M6 — `source` validated by reqValidator(grantCardSchema).
      const { userId, collectionCardId, source } = req.validated;
      const grantSource = source || 'ADMIN';

      const card = await req.prisma.collectionCard.findUnique({
        where: { id: collectionCardId },
      });
      if (!card) return res.status(404).json({ error: 'Шаблон карты не найден' });

      const existing = await req.prisma.userCard.findFirst({
        where: { userId, collectionCardId },
        select: { id: true },
      });
      if (existing) {
        return res.status(400).json({ error: 'У пользователя уже есть эта карта' });
      }

      const userCard = await auditLog.withAudit(
        req.prisma,
        {
          actorId: req.userId,
          action: auditLog.AUDIT_ACTIONS.CARD_GRANT,
          targetType: 'UserCard',
          requestId: req.id,
          reason: `granted collectionCardId=${collectionCardId} to userId=${userId}`,
        },
        async (tx, setAudit) => {
          const created = await tx.userCard.create({
            data: {
              userId,
              collectionCardId,
              health: card.maxHealth,
              source: grantSource,
            },
            include: { collectionCard: true },
          });
          setAudit({ targetId: created.id, before: null, after: created });
          return created;
        }
      );

      res.json(userCard);
    } catch (err) {
      if (err && err.code === 'P2002') {
        return res.status(400).json({ error: 'У пользователя уже есть эта карта' });
      }
      (req.log ?? logger).error({ err }, 'Grant card error');
      next(err);
    }
  },
];

// New canonical path under /userCards (Plan 3 will extend with revoke/HP-edit).
// We expose POST /grant here so future tests can use the canonical URL even
// before the legacy /grant-card path is removed.
router.post('/grant', ...grantCardHandler);

// ---------------------------------------------------------------------------
// Phase 4.5 / 04.5-03 / ADMIN-04 — UserCard inventory endpoints.
// ---------------------------------------------------------------------------

// GET /api/admin/userCards/by-user/:userId — list a user's collection inventory.
router.get('/by-user/:userId', async (req, res, next) => {
  try {
    const userId = String(req.params.userId);
    const items = await req.prisma.userCard.findMany({
      where: { userId },
      orderBy: { acquiredAt: 'desc' },
      include: { collectionCard: true },
    });
    res.json({ items, total: items.length });
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin userCards by-user error');
    next(err);
  }
});

// DELETE /api/admin/userCards/:id — revoke a UserCard.
// T-04.5-03-01 mitigation: clean up DeckCard rows referencing this UserCard
// inside the same withAudit tx BEFORE deleting the UserCard so the FK is
// satisfied. (DeckCard.userCardId now ON DELETE CASCADE per Migration A,
// but we delete explicitly so the audit payload captures the affected slots
// and rollback semantics are deterministic.)
router.delete('/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const result = await auditLog.withAudit(
      req.prisma,
      {
        actorId: req.userId,
        action: auditLog.AUDIT_ACTIONS.USERCARD_REVOKE,
        targetType: 'UserCard',
        targetId: id,
        requestId: req.id,
      },
      async (tx, setAudit) => {
        const before = await tx.userCard.findUnique({
          where: { id },
          include: { deckCards: true },
        });
        if (!before) throw new AppError('NOT_FOUND', 404);
        // FK cleanup before user-card delete (T-04.5-03-01).
        await tx.deckCard.deleteMany({ where: { userCardId: id } });
        await tx.userCard.delete({ where: { id } });
        setAudit({
          before: {
            id: before.id,
            userId: before.userId,
            collectionCardId: before.collectionCardId,
            health: before.health,
            deckCardCount: before.deckCards?.length || 0,
          },
          after: null,
        });
        return { id, deleted: true };
      }
    );
    res.json(result);
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin userCard revoke error');
    next(err);
  }
});

// PUT /api/admin/userCards/:id/health — admin HP edit (clamped to [0, maxHealth]).
router.put('/:id/health', reqValidator(adminUserCardHpSchema), async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const { health } = req.validated;
      const result = await auditLog.withAudit(
        req.prisma,
        {
          actorId: req.userId,
          action: auditLog.AUDIT_ACTIONS.USERCARD_HP_EDIT,
          targetType: 'UserCard',
          targetId: id,
          requestId: req.id,
        },
        async (tx, setAudit) => {
          const before = await tx.userCard.findUnique({
            where: { id },
            include: { collectionCard: { select: { maxHealth: true } } },
          });
          if (!before) throw new AppError('NOT_FOUND', 404);
          const maxHp = before.collectionCard?.maxHealth ?? Number.MAX_SAFE_INTEGER;
          const clamped = Math.max(0, Math.min(Number(health), maxHp));
          const after = await tx.userCard.update({
            where: { id },
            data: { health: clamped },
          });
          setAudit({
            before: { health: before.health },
            after: { health: after.health },
          });
          return after;
        }
      );
    res.json(result);
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin userCard HP edit error');
    next(err);
  }
});

module.exports = router;
module.exports.grantCardHandler = grantCardHandler;
