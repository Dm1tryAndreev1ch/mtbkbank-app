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
const { adminGrantCardSchema } = require('../../schemas/admin');
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

module.exports = router;
module.exports.grantCardHandler = grantCardHandler;
