const express = require('express');
const bcrypt = require('bcryptjs');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { processCardDrop } = require('../services/cardEngine');
const router = express.Router();

router.use(authMiddleware);
router.use(adminMiddleware);

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
    console.error('Admin dashboard error:', err);
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
    console.error('Admin extended dashboard error:', err);
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

// PUT /api/admin/users/:id
router.put('/users/:id', async (req, res) => {
  try {
    const { name, mbPoints, status, pin } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (mbPoints !== undefined) data.mbPoints = mbPoints;
    if (status !== undefined) data.status = status;
    if (pin) data.pin = await bcrypt.hash(pin, 10);

    const user = await req.prisma.user.update({
      where: { id: req.params.id },
      data,
      select: { id: true, name: true, phone: true, mbPoints: true, status: true },
    });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/admin/users
router.post('/users', async (req, res) => {
  try {
    const { name, phone, pin, mbPoints = 0, status = 'STANDARD', isAdmin = false } = req.body;
    const hashedPin = await bcrypt.hash(pin, 10);

    const user = await req.prisma.user.create({
      data: { name, phone, pin: hashedPin, mbPoints, status, isAdmin },
    });

    await req.prisma.bankAccount.create({
      data: {
        userId: user.id,
        name: 'Главный счёт',
        type: 'main',
        balance: 0,
        currency: 'RUB',
      },
    });

    // FIX: создаём дефолтную активную колоду для каждого нового пользователя
    await req.prisma.deck.create({
      data: {
        userId: user.id,
        name: 'Моя колода',
        isActive: true,
      },
    });

    res.json(user);
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Ошибка создания пользователя' });
  }
});

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
router.post('/cards', async (req, res) => {
  try {
    const {
      name, description, rarity, brandName, brandIcon, brandLogo, imageUrl,
      cashbackPercent, maxHealth, dropRate, isActive,
    } = req.body;
    const card = await req.prisma.collectionCard.create({
      data: {
        name, description, rarity, brandName, brandIcon, brandLogo, imageUrl,
        cashbackPercent, maxHealth, dropRate,
        isActive: isActive !== undefined ? isActive : true,
      },
    });
    res.json(card);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка создания карты' });
  }
});

// PUT /api/admin/cards/:id
// FIX: whitelist полей — mass assignment устранён
router.put('/cards/:id', async (req, res) => {
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

    const card = await req.prisma.collectionCard.update({
      where: { id: req.params.id },
      data,
    });
    res.json(card);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка обновления карты' });
  }
});

// DELETE /api/admin/cards/:id
router.delete('/cards/:id', async (req, res) => {
  try {
    await req.prisma.collectionCard.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка удаления' });
  }
});

// ==================== GRANT CARDS ====================

// POST /api/admin/grant-card
// FIX: добавлена проверка дубликата перед выдачей
router.post('/grant-card', async (req, res) => {
  try {
    const { userId, collectionCardId } = req.body;
    const card = await req.prisma.collectionCard.findUnique({
      where: { id: collectionCardId },
    });
    if (!card) return res.status(404).json({ error: 'Шаблон карты не найден' });

    const existing = await req.prisma.userCard.findFirst({
      where: { userId, collectionCardId },
      select: { id: true },
    });
    if (existing) return res.status(400).json({ error: 'У пользователя уже есть эта карта' });

    const userCard = await req.prisma.userCard.create({
      data: {
        userId,
        collectionCardId,
        health: card.maxHealth,
        source: 'ADMIN',
      },
      include: { collectionCard: true },
    });

    res.json(userCard);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'У пользователя уже есть эта карта' });
    }
    res.status(500).json({ error: 'Ошибка выдачи карты' });
  }
});

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

// POST /api/admin/simulate-transaction
router.post('/simulate-transaction', async (req, res) => {
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
      return { transaction: t, account: updatedAccount };
    });

    let droppedCard = null;
    if (!isCredit && txType === 'PURCHASE') {
      try {
        droppedCard = await processCardDrop(req.prisma, userId, result.transaction.id);
      } catch (dropErr) {
        console.error('Admin simulate card drop error (non-critical):', dropErr);
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
    console.error('Simulate transaction error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
