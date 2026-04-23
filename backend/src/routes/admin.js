const express = require('express');
const bcrypt = require('bcryptjs');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { processCardDrop } = require('../services/cardEngine');
const router = express.Router();

router.use(authMiddleware);
router.use(adminMiddleware);

// ==================== USERS ====================

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

    res.json(user);
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Ошибка создания пользователя' });
  }
});

// ==================== CARD TEMPLATES ====================

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

router.post('/cards', async (req, res) => {
  try {
    const {
      name, description, rarity, brandName, brandLogo, imageUrl,
      cashbackPercent, maxHealth, dropRate, isActive,
    } = req.body;
    const card = await req.prisma.collectionCard.create({
      data: {
        name, description, rarity, brandName, brandLogo, imageUrl,
        cashbackPercent, maxHealth, dropRate,
        isActive: isActive !== undefined ? isActive : true,
      },
    });
    res.json(card);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка создания карты' });
  }
});

router.put('/cards/:id', async (req, res) => {
  try {
    const {
      name, description, rarity, brandName, brandLogo, imageUrl,
      cashbackPercent, maxHealth, dropRate, isActive,
    } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (rarity !== undefined) data.rarity = rarity;
    if (brandName !== undefined) data.brandName = brandName;
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
    res.status(500).json({ error: 'Ошибка выдачи карты' });
  }
});

// ==================== USER ACCOUNTS ====================

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

router.post('/simulate-transaction', async (req, res) => {
  try {
    const { userId, amount, category, merchant, merchantIcon, type = 'PURCHASE' } = req.body;
    let { accountId } = req.body;

    // Находим счёт если не передан
    if (!accountId) {
      const mainAccount = await req.prisma.bankAccount.findFirst({
        where: { userId, type: 'main' },
      });

      if (mainAccount) {
        accountId = mainAccount.id;
      } else {
        const anyAccount = await req.prisma.bankAccount.findFirst({
          where: { userId },
        });
        if (!anyAccount) {
          return res.status(404).json({ error: 'У пользователя нет счетов' });
        }
        accountId = anyAccount.id;
      }
    }

    // Проверяем что счёт принадлежит пользователю
    const account = await req.prisma.bankAccount.findFirst({
      where: { id: accountId, userId },
    });
    if (!account) return res.status(404).json({ error: 'Счёт не найден' });

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: 'Укажите корректную сумму' });
    }

    // TRANSFER_IN и TOPUP — входящие (деньги приходят на счёт)
    const isCredit = type === 'TRANSFER_IN' || type === 'TOPUP';

    const transaction = await req.prisma.$transaction(async (tx) => {
      // ИСПРАВЛЕНО: используем fromAccountId/toAccountId вместо accountId
      const t = await tx.transaction.create({
        data: {
          userId,
          // Входящие: счёт — получатель (toAccountId)
          // Исходящие: счёт — отправитель (fromAccountId)
          ...(isCredit
            ? { toAccountId: accountId }
            : { fromAccountId: accountId }
          ),
          amount: numericAmount,
          type,
          status: 'COMPLETED',
          category: category || 'Покупки',
          merchant: merchant || 'Тестовый мерчант',
          merchantIcon: merchantIcon || 'store',
          description: 'Админ: симуляция транзакции',
        },
      });

      // Обновляем баланс счёта
      await tx.bankAccount.update({
        where: { id: accountId },
        data: {
          balance: {
            [isCredit ? 'increment' : 'decrement']: numericAmount,
          },
        },
      });

      return t;
    });

    // Обработка дропа карты при покупке (не блокирующая)
    if (!isCredit) {
      processCardDrop(
        req.prisma,
        userId,
        numericAmount,
        category || 'Покупки',
      ).catch(console.error);
    }

    res.json(transaction);
  } catch (err) {
    console.error('Simulate transaction error:', err);
    res.status(500).json({ error: err.message || 'Ошибка сервера' });
  }
});

module.exports = router;