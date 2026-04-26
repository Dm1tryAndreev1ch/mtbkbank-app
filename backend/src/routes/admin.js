const express = require('express');
const bcrypt = require('bcryptjs');
const { processCardDrop } = require('../services/cardEngine');
const { logger } = require('../logger');
// Phase 3 / 03-10 / SEC-14 / D-03 — every admin mutation wraps writes in
// prisma.$transaction and calls auditLog.writeAudit(tx, ...) inside the same tx.
// We import the *module* (not destructured) so tests can monkey-patch
// auditLog.writeAudit at runtime to assert the rollback contract.
const auditLog = require('../services/auditLog');
const { reqValidator } = require('../middleware/reqValidator');
const {
  adminUserUpdateSchema,
  adminUserCreateSchema,
  adminGrantCardSchema,
} = require('../schemas/admin');
const { requireFreshAdmin } = require('../middleware/requireFreshAdmin');
const { AppError } = require('../errors/AppError');
const router = express.Router();

// Phase 3 / SEC-08 / D-05..D-08 — auth + admin + requireFreshAdmin are now mounted at the
// app level in src/index.js (`app.use('/api/admin', authMiddleware, adminMiddleware,
// requireFreshAdmin, adminRoutes)`). Do NOT re-add `router.use(authMiddleware)` here:
// double-mounting would re-decode the JWT on every admin request.

// ==================== DASHBOARD ====================

// GET /api/admin/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const [totalUsers, totalCards, totalTransactions, mbAgg, cards] = await Promise.all([
      req.prisma.user.count(),
      req.prisma.userCard.count(),
      req.prisma.transaction.count(),
      req.prisma.user.aggregate({ _sum: { mbPoints: true } }),
      req.prisma.userCard.findMany({
        select: { collectionCard: { select: { rarity: true } } },
      }),
    ]);

    const rarityDistribution = { COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0 };
    for (const c of cards) {
      const rarity = c.collectionCard?.rarity;
      if (rarity && rarityDistribution[rarity] !== undefined) {
        rarityDistribution[rarity] += 1;
      }
    }

    res.json({
      totalUsers,
      totalCards,
      totalTransactions,
      totalMBInCirculation: mbAgg._sum.mbPoints || 0,
      rarityDistribution,
    });
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin dashboard error');
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/admin/dashboard/extended
router.get('/dashboard/extended', async (req, res) => {
  try {
    const [balanceAgg, recentTransactions] = await Promise.all([
      req.prisma.bankAccount.aggregate({ _sum: { balance: true } }),
      req.prisma.transaction.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          user: { select: { id: true, name: true, phone: true } },
        },
      }),
    ]);

    res.json({
      totalBalance: balanceAgg._sum.balance || 0,
      recentTransactions,
    });
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin extended dashboard error');
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ==================== USERS ====================

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const safeLimit = Math.min(parseInt(limit) || 50, 100);
    const safeOffset = Math.max(parseInt(offset) || 0, 0);

    const users = await req.prisma.user.findMany({
      select: {
        id: true, name: true, phone: true, mbPoints: true,
        status: true, isAdmin: true, createdAt: true,
        _count: { select: { userCards: true, accounts: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: safeLimit,
      skip: safeOffset,
    });
    const total = await req.prisma.user.count();
    res.json({ users, total, limit: safeLimit, offset: safeOffset });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/admin/users/:id — Phase 3 / 03-10 / SEC-14 + SEC-10 + D-07
router.put(
  '/users/:id',
  reqValidator(adminUserUpdateSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const data = { ...req.validated };
      if (data.pin) data.pin = await bcrypt.hash(data.pin, 10);

      const updated = await req.prisma.$transaction(async (tx) => {
        const before = await tx.user.findUnique({
          where: { id },
          select: {
            id: true, name: true, phone: true, mbPoints: true,
            status: true, isAdmin: true,
          },
        });
        if (!before) throw new AppError('NOT_FOUND', 404);
        const after = await tx.user.update({
          where: { id },
          data,
          select: {
            id: true, name: true, phone: true, mbPoints: true,
            status: true, isAdmin: true,
          },
        });
        await auditLog.writeAudit(tx, {
          actorId: req.userId,
          action: 'USER_UPDATE',
          targetType: 'User',
          targetId: id,
          before,
          after,
          requestId: req.id,
        });
        return after;
      });

      // D-07 — drop the freshness cache entry so demote/promote takes effect immediately
      if ('isAdmin' in data) requireFreshAdmin.invalidate(req.params.id);

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/admin/users — Phase 3 / 03-10 / SEC-14 + SEC-10
router.post(
  '/users',
  reqValidator(adminUserCreateSchema),
  async (req, res, next) => {
    try {
      const {
        name, phone, pin, mbPoints = 0, status = 'STANDARD', isAdmin = false,
      } = req.validated;
      const hashedPin = await bcrypt.hash(pin, 10);

      const created = await req.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { name, phone, pin: hashedPin, mbPoints, status, isAdmin },
        });
        await tx.bankAccount.create({
          data: {
            userId: user.id,
            name: 'Главный счёт',
            type: 'main',
            balance: 0,
            currency: 'RUB',
          },
        });
        // Дефолтная активная колода для каждого нового пользователя
        await tx.deck.create({
          data: {
            userId: user.id,
            name: 'Моя колода',
            isActive: true,
          },
        });
        await auditLog.writeAudit(tx, {
          actorId: req.userId,
          action: 'USER_CREATE',
          targetType: 'User',
          targetId: user.id,
          before: null,
          after: user,
          requestId: req.id,
        });
        return user;
      });

      res.json(created);
    } catch (err) {
      (req.log ?? logger).error({ err }, 'Create user error');
      next(err);
    }
  }
);

// ==================== CARD TEMPLATES ====================

// GET /api/admin/cards
router.get('/cards', async (req, res) => {
  try {
    const cards = await req.prisma.collectionCard.findMany({
      orderBy: [{ rarity: 'asc' }, { name: 'asc' }],
    });
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/admin/cards
// FIX: whitelist полей — mass assignment устранён
router.post('/cards', async (req, res, next) => {
  try {
    const {
      name, description, rarity, brandName, brandIcon, brandLogo, imageUrl,
      cashbackPercent, maxHealth, dropRate, isActive,
    } = req.body;
    const created = await req.prisma.$transaction(async (tx) => {
      const card = await tx.collectionCard.create({
        data: {
          name, description, rarity, brandName, brandIcon, brandLogo, imageUrl,
          cashbackPercent, maxHealth, dropRate,
          isActive: isActive !== undefined ? isActive : true,
        },
      });
      await auditLog.writeAudit(tx, {
        actorId: req.userId,
        action: 'CARD_TEMPLATE_CREATE',
        targetType: 'CollectionCard',
        targetId: card.id,
        before: null,
        after: card,
        requestId: req.id,
      });
      return card;
    });
    res.json(created);
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Create card template error');
    next(err);
  }
});

// PUT /api/admin/cards/:id
// FIX: whitelist полей — mass assignment устранён
router.put('/cards/:id', async (req, res, next) => {
  try {
    const {
      name, description, rarity, brandName, brandIcon, brandLogo, imageUrl,
      cashbackPercent, maxHealth, dropRate, isActive,
    } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (rarity !== undefined) data.rarity = rarity;
    if (brandName !== undefined) data.brandName = brandName;
    if (brandIcon !== undefined) data.brandIcon = brandIcon;
    if (brandLogo !== undefined) data.brandLogo = brandLogo;
    if (imageUrl !== undefined) data.imageUrl = imageUrl;
    if (cashbackPercent !== undefined) data.cashbackPercent = cashbackPercent;
    if (maxHealth !== undefined) data.maxHealth = maxHealth;
    if (dropRate !== undefined) data.dropRate = dropRate;
    if (isActive !== undefined) data.isActive = isActive;

    const { id } = req.params;
    const updated = await req.prisma.$transaction(async (tx) => {
      const before = await tx.collectionCard.findUnique({ where: { id } });
      if (!before) throw new AppError('NOT_FOUND', 404);
      const after = await tx.collectionCard.update({ where: { id }, data });
      await auditLog.writeAudit(tx, {
        actorId: req.userId,
        action: 'CARD_TEMPLATE_UPDATE',
        targetType: 'CollectionCard',
        targetId: id,
        before,
        after,
        requestId: req.id,
      });
      return after;
    });
    res.json(updated);
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Update card template error');
    next(err);
  }
});

// DELETE /api/admin/cards/:id (soft-delete via isActive=false)
router.delete('/cards/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    await req.prisma.$transaction(async (tx) => {
      const before = await tx.collectionCard.findUnique({ where: { id } });
      if (!before) throw new AppError('NOT_FOUND', 404);
      const after = await tx.collectionCard.update({
        where: { id },
        data: { isActive: false },
      });
      await auditLog.writeAudit(tx, {
        actorId: req.userId,
        action: 'CARD_TEMPLATE_DELETE',
        targetType: 'CollectionCard',
        targetId: id,
        before,
        after,
        requestId: req.id,
      });
      return after;
    });
    res.json({ success: true });
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Delete card template error');
    next(err);
  }
});

// ==================== GRANT CARDS ====================

// POST /api/admin/grant-card — Phase 3 / 03-10 / SEC-14
// FIX: добавлена проверка дубликата перед выдачей
router.post(
  '/grant-card',
  reqValidator(adminGrantCardSchema),
  async (req, res, next) => {
    try {
      // Phase 4 / 04-02 / B-M6 — `source` is now an optional enum field
      // validated by reqValidator(grantCardSchema). Defaults to 'ADMIN' when
      // not supplied so existing admin UI flows are unaffected.
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

      const userCard = await req.prisma.$transaction(async (tx) => {
        const created = await tx.userCard.create({
          data: {
            userId,
            collectionCardId,
            health: card.maxHealth,
            source: grantSource,
          },
          include: { collectionCard: true },
        });
        await auditLog.writeAudit(tx, {
          actorId: req.userId,
          action: 'CARD_GRANT',
          targetType: 'UserCard',
          targetId: created.id,
          before: null,
          after: created,
          reason: `granted collectionCardId=${collectionCardId} to userId=${userId}`,
          requestId: req.id,
        });
        return created;
      });

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

// ==================== USER ACCOUNTS ====================

// GET /api/admin/users/:id/accounts
router.get('/users/:id/accounts', async (req, res) => {
  try {
    const accounts = await req.prisma.bankAccount.findMany({
      where: { userId: req.params.id },
      orderBy: { createdAt: 'asc' },
    });
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка загрузки счетов' });
  }
});

// ==================== SIMULATE TRANSACTION ====================

// POST /api/admin/simulate-transaction — Phase 3 / 03-10 / SEC-14
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

    const result = await req.prisma.$transaction(async (tx) => {
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
      await auditLog.writeAudit(tx, {
        actorId: req.userId,
        action: 'TRANSACTION_SIMULATE',
        targetType: 'Transaction',
        targetId: t.id,
        before: null,
        after: t,
        reason: `simulated ${txType} amount=${numericAmount} for userId=${userId}`,
        requestId: req.id,
      });
      return { transaction: t, account: updatedAccount };
    });

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
