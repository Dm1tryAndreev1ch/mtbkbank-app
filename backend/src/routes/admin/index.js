// Phase 4.5 / 04.5-01 / D-01 — Admin sub-router mount.
//
// Replaces the singular backend/src/routes/admin.js (deleted by Plan 1) with
// a directory-index router that mounts twelve domain sub-routers + dashboard.
//
// Auth chain (authMiddleware → adminMiddleware → requireFreshAdmin →
// adminDestructiveLimiter) is mounted app-level in src/index.js. Sub-routers
// MUST NOT remount auth middleware (regression-guard.sh step (d) pins this).
//
// Plans 2-5 fill the sub-router bodies vertically (one ADMIN-XX requirement
// per commit). Plan 1 ships skeleton + the existing admin.js endpoints
// migrated 1:1 into users.js / bankCards.js / userCards.js / transactions.js
// / dashboard.js.

const express = require('express');
const router = express.Router();

router.use('/accounts',      require('./accounts'));
router.use('/transactions',  require('./transactions'));
router.use('/bankCards',     require('./bankCards'));
// Legacy alias — admin SPA still posts to /api/admin/cards/*. Plan 3 will
// migrate the SPA to /api/admin/bankCards/templates/*; until then, keep both
// mounts pointing at the same handlers so the existing admin SPA cards page
// works without a same-plan client change.
{
  const bankCardsRouter = require('./bankCards');
  // Mount the same router under /cards so /cards/templates → /cards in legacy URL.
  // Legacy admin SPA posts to /api/admin/cards (collection-template CRUD), so we
  // additionally expose collection-template endpoints under /cards (no /templates
  // suffix) by creating a thin alias router.
  const express = require('express');
  const aliasRouter = express.Router();
  // Re-route the four legacy paths through the new router by stripping/inserting.
  aliasRouter.get('/',           (req, _res, next) => { req.url = '/templates'; next(); }, bankCardsRouter);
  aliasRouter.post('/',          (req, _res, next) => { req.url = '/templates'; next(); }, bankCardsRouter);
  aliasRouter.put('/:id',        (req, _res, next) => { req.url = `/templates/${req.params.id}`; next(); }, bankCardsRouter);
  aliasRouter.delete('/:id',     (req, _res, next) => { req.url = `/templates/${req.params.id}`; next(); }, bankCardsRouter);
  router.use('/cards', aliasRouter);
}
router.use('/userCards',     require('./userCards'));
router.use('/decks',         require('./decks'));
router.use('/quests',        require('./quests'));
router.use('/limits',        require('./limits'));        // → prisma.spendingLimit (NOT prisma.limit)
router.use('/payments',      require('./payments'));
router.use('/subscriptions', require('./subscriptions'));
router.use('/notifications', require('./notifications'));
router.use('/trades',        require('./trades'));
router.use('/users',         require('./users'));

// Dashboard handlers retained at /api/admin/dashboard and /api/admin/dashboard/extended.
const dashboard = require('./dashboard');
router.get('/dashboard',          dashboard.summary);
router.get('/dashboard/extended', dashboard.extended);

// ---------------------------------------------------------------------------
// Migrated: POST /api/admin/grant-card (legacy path) — Plan 3 will move this
// to userCards.js with a /userCards/grant alias. Kept here at the legacy path
// so existing admin SPA keeps working without a same-plan client change.
// ---------------------------------------------------------------------------
const auditLog = require('../../services/auditLog');
const { reqValidator } = require('../../middleware/reqValidator');
const { adminGrantCardSchema } = require('../../schemas/admin');
const { logger } = require('../../logger');

router.post(
  '/grant-card',
  reqValidator(adminGrantCardSchema),
  async (req, res, next) => {
    try {
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
          reason: `granted collectionCardId=${collectionCardId} to userId=${userId}`,
          requestId: req.id,
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
  }
);

// ---------------------------------------------------------------------------
// Migrated: POST /api/admin/simulate-transaction (legacy path) — Plan 2 will
// add the canonical /transactions/simulate route; this legacy path stays
// pointed here so the admin SPA simulate page keeps working pre-rewrite.
// ---------------------------------------------------------------------------
const { processCardDrop } = require('../../services/cardEngine');

router.post('/simulate-transaction', async (req, res, next) => {
  try {
    const { userId, amount, category, merchant, merchantIcon, type = 'PURCHASE' } = req.body;
    let { accountId } = req.body;

    if (!accountId) {
      const mainAccount = await req.prisma.bankAccount.findFirst({ where: { userId, type: 'main' } });
      if (!mainAccount) {
        const anyAccount = await req.prisma.bankAccount.findFirst({ where: { userId } });
        if (!anyAccount) return res.status(404).json({ error: 'У пользователя нет счетов' });
        accountId = anyAccount.id;
      } else {
        accountId = mainAccount.id;
      }
    }

    const account = await req.prisma.bankAccount.findFirst({ where: { id: accountId, userId } });
    if (!account) return res.status(404).json({ error: 'Счёт не найден' });

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: 'Укажите корректную сумму' });
    }

    const isCredit = type === 'TRANSFER_IN' || type === 'TOPUP';
    const txType = type || 'PURCHASE';

    const result = await auditLog.withAudit(
      req.prisma,
      {
        actorId: req.userId,
        action: auditLog.AUDIT_ACTIONS.TRANSACTION_SIMULATE,
        targetType: 'Transaction',
        reason: `simulated ${txType} amount=${numericAmount} for userId=${userId}`,
        requestId: req.id,
      },
      async (tx, setAudit) => {
        let updatedAccount;
        if (!isCredit) {
          const debitResult = await tx.bankAccount.updateMany({
            where: { id: accountId, balance: { gte: numericAmount } },
            data: { balance: { decrement: numericAmount } },
          });
          if (debitResult.count !== 1) throw new Error('INSUFFICIENT');
          updatedAccount = await tx.bankAccount.findUnique({ where: { id: accountId } });
        } else {
          updatedAccount = await tx.bankAccount.update({
            where: { id: accountId },
            data: { balance: { increment: numericAmount } },
          });
        }

        const t = await tx.transaction.create({
          data: {
            fromAccountId: accountId,
            userId,
            amount: numericAmount,
            type: txType,
            status: 'completed',
            category: category || 'Покупки',
            merchant: merchant || 'Тестовый мерчант',
            merchantIcon: merchantIcon || 'store',
            description: 'Админ: симуляция транзакции',
          },
        });
        setAudit({ targetId: t.id, before: null, after: t });
        return { transaction: t, account: updatedAccount };
      }
    );

    let droppedCard = null;
    if (!isCredit && txType === 'PURCHASE') {
      try {
        droppedCard = await processCardDrop(req.prisma, userId, result.transaction.id);
      } catch (dropErr) {
        (req.log ?? logger).error({ err: dropErr }, 'Admin simulate card drop error (non-critical)');
      }
    }

    res.json({
      transaction: result.transaction,
      account: result.account,
      droppedCard,
    });
  } catch (err) {
    if (err.message === 'INSUFFICIENT') {
      return res.status(400).json({ error: 'Недостаточно средств на момент списания' });
    }
    (req.log ?? logger).error({ err }, 'Simulate transaction error');
    next(err);
  }
});

module.exports = router;
