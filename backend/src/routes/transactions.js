const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { getCached, setCached } = require('../cache');
const router = express.Router();

router.use(authMiddleware);

// GET /api/transactions
router.get('/', async (req, res) => {
  try {
    const { limit = 20, offset = 0, category, type } = req.query;
    const where = { userId: req.userId };
    if (category) where.category = category;
    if (type) where.type = type;

    const [transactions, total] = await Promise.all([
      req.prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset),
      }),
      req.prisma.transaction.count({ where }),
    ]);

    res.json({ transactions, total, limit: parseInt(limit), offset: parseInt(offset) });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/transactions/analytics
router.get('/analytics', async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    const cacheKey = `analytics:${req.userId}:${period}`;
    const cachedData = await getCached(cacheKey);
    if (cachedData) return res.json(cachedData);

    const now = new Date();
    let startDate;
    if (period === 'week') startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    else if (period === 'month') startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    else startDate = new Date(now.getFullYear(), 0, 1);

    const transactions = await req.prisma.transaction.findMany({
      where: { userId: req.userId, type: 'PURCHASE', createdAt: { gte: startDate } },
    });

    const categories = {};
    let totalSpent = 0;
    for (const t of transactions) {
      const cat = t.category || 'Другое';
      if (!categories[cat]) categories[cat] = 0;
      categories[cat] += Math.abs(t.amount);
      totalSpent += Math.abs(t.amount);
    }

    const breakdown = Object.entries(categories)
      .map(([category, amount]) => ({
        category, amount,
        percentage: totalSpent > 0 ? Math.round((amount / totalSpent) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    const payload = { totalSpent, breakdown, period };
    await setCached(cacheKey, payload, 300);
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/**
 * GET /api/transactions/resolve-recipient
 * Resolves a phone number or card number to a user + account.
 * Query: ?value=+37529...  or  ?value=0000000000000000
 */
router.get('/resolve-recipient', async (req, res) => {
  try {
    const { value } = req.query;
    if (!value) return res.status(400).json({ error: 'Укажите номер телефона или карты' });

    const clean = value.replace(/[\s\-+]/g, '');
    let user = null;
    let account = null;

    // Try phone lookup first
    if (/^\d{10,12}$/.test(clean)) {
      const normalized = clean.startsWith('375') ? `+${clean}` : clean;
      user = await req.prisma.user.findFirst({
        where: {
          OR: [
            { phone: normalized },
            { phone: `+${clean}` },
            { phone: clean },
          ],
        },
        select: { id: true, name: true, phone: true, avatarUrl: true },
      });
      if (user) {
        account = await req.prisma.bankAccount.findFirst({
          where: { userId: user.id, type: 'main' },
          orderBy: { createdAt: 'asc' },
        });
        if (!account) {
          account = await req.prisma.bankAccount.findFirst({
            where: { userId: user.id },
            orderBy: { createdAt: 'asc' },
          });
        }
      }
    }

    // Try card number lookup (16 digits)
    if (!user && /^\d{16}$/.test(clean)) {
      const card = await req.prisma.bankCard.findFirst({
        where: { cardNumber: clean },
        include: {
          bankAccount: {
            include: {
              user: { select: { id: true, name: true, phone: true, avatarUrl: true } },
            },
          },
        },
      });
      if (card) {
        user = card.bankAccount.user;
        account = card.bankAccount;
      }
    }

    if (!user || !account) {
      return res.status(404).json({ error: 'Получатель не найден' });
    }

    if (account.userId === req.userId) {
      return res.status(400).json({ error: 'Нельзя переводить самому себе через этот метод' });
    }

    res.json({
      user: { id: user.id, name: user.name, phone: user.phone, avatarUrl: user.avatarUrl },
      accountId: account.id,
    });
  } catch (err) {
    console.error('Resolve recipient error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/**
 * POST /api/transactions/transfer
 * Supports two modes:
 *   1. { fromAccountId, toAccountId, amount, description }  — classic between known accounts
 *   2. { fromAccountId, recipient, amount, description }    — resolve by phone/card then transfer
 */
router.post('/transfer', async (req, res) => {
  try {
    const { fromAccountId, toAccountId: explicitToAccountId, recipient, amount, description } = req.body;

    if (!fromAccountId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Укажите счёт списания и сумму' });
    }

    const fromAccount = await req.prisma.bankAccount.findFirst({
      where: { id: fromAccountId, userId: req.userId },
    });
    if (!fromAccount) return res.status(404).json({ error: 'Счёт отправителя не найден' });

    // --- Resolve toAccountId ---
    let toAccountId = explicitToAccountId;
    let recipientUserId = null;

    if (!toAccountId && recipient) {
      const clean = String(recipient).replace(/[\s\-+]/g, '');
      let targetAccount = null;

      // By phone
      if (/^\d{10,12}$/.test(clean)) {
        const normalized = clean.startsWith('375') ? `+${clean}` : `+${clean}`;
        const toUser = await req.prisma.user.findFirst({
          where: {
            OR: [{ phone: normalized }, { phone: `+${clean}` }, { phone: clean }],
          },
        });
        if (toUser) {
          targetAccount = await req.prisma.bankAccount.findFirst({
            where: { userId: toUser.id, type: 'main' },
          }) || await req.prisma.bankAccount.findFirst({
            where: { userId: toUser.id },
            orderBy: { createdAt: 'asc' },
          });
        }
      }

      // By card number
      if (!targetAccount && /^\d{16}$/.test(clean)) {
        const card = await req.prisma.bankCard.findFirst({
          where: { cardNumber: clean },
          include: { bankAccount: true },
        });
        if (card) targetAccount = card.bankAccount;
      }

      if (!targetAccount) {
        return res.status(404).json({ error: 'Получатель не найден. Проверьте номер телефона или карты.' });
      }
      toAccountId = targetAccount.id;
      recipientUserId = targetAccount.userId;
    }

    if (!toAccountId) {
      return res.status(400).json({ error: 'Укажите получателя перевода' });
    }

    const toAccount = await req.prisma.bankAccount.findUnique({ where: { id: toAccountId } });
    if (!toAccount) return res.status(404).json({ error: 'Счёт получателя не найден' });
    if (toAccount.userId === req.userId && !explicitToAccountId) {
      return res.status(400).json({ error: 'Нельзя переводить самому себе через этот метод. Используйте «Между своими счетами».' });
    }

    // --- Atomic transfer ---
    const result = await req.prisma.$transaction(async (tx) => {
      // Re-read balance inside transaction to prevent TOCTOU
      const src = await tx.bankAccount.findUnique({ where: { id: fromAccountId } });
      if (src.balance < amount) throw new Error('INSUFFICIENT');

      const dec = await tx.bankAccount.update({
        where: { id: fromAccountId },
        data: { balance: { decrement: amount } },
      });

      const inc = await tx.bankAccount.update({
        where: { id: toAccountId },
        data: { balance: { increment: amount } },
      });

      const trans = await tx.transaction.create({
        data: {
          userId: req.userId,
          fromAccountId,
          toAccountId,
          amount,
          type: 'TRANSFER_OUT',
          category: 'Перевод',
          merchant: description || 'Перевод',
          merchantIcon: 'sync_alt',
          description: description || `Перевод ${amount} ${fromAccount.currency}`,
        },
      });

      return { trans, inc };
    });

    // TRANSFER_IN record for recipient
    const destUserId = recipientUserId || toAccount.userId;
    if (destUserId !== req.userId) {
      await req.prisma.transaction.create({
        data: {
          userId: destUserId,
          fromAccountId,
          toAccountId,
          amount,
          type: 'TRANSFER_IN',
          category: 'Перевод',
          merchant: 'Входящий перевод',
          merchantIcon: 'account_balance_wallet',
          description: description || `Входящий перевод ${amount} ${toAccount.currency}`,
        },
      });

      await req.prisma.notification.create({
        data: {
          userId: destUserId,
          title: '💸 Входящий перевод',
          body: `Вам поступил перевод ${amount} ${toAccount.currency}`,
          icon: 'account_balance_wallet',
        },
      });
    }

    res.json({ success: true, transaction: result.trans });
  } catch (err) {
    if (err.message === 'INSUFFICIENT') {
      return res.status(400).json({ error: 'Недостаточно средств на момент списания' });
    }
    console.error('Transfer error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/**
 * POST /api/transactions/transfer-own
 * Transfer between the authenticated user's own accounts.
 */
router.post('/transfer-own', async (req, res) => {
  try {
    const { fromAccountId, toAccountId, amount, description } = req.body;
    if (!fromAccountId || !toAccountId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Укажите оба счёта и сумму' });
    }
    if (fromAccountId === toAccountId) {
      return res.status(400).json({ error: 'Счета отправителя и получателя совпадают' });
    }

    // Both accounts must belong to this user
    const [fromAcc, toAcc] = await Promise.all([
      req.prisma.bankAccount.findFirst({ where: { id: fromAccountId, userId: req.userId } }),
      req.prisma.bankAccount.findFirst({ where: { id: toAccountId, userId: req.userId } }),
    ]);
    if (!fromAcc) return res.status(404).json({ error: 'Счёт списания не найден' });
    if (!toAcc) return res.status(404).json({ error: 'Счёт зачисления не найден' });

    const result = await req.prisma.$transaction(async (tx) => {
      const src = await tx.bankAccount.findUnique({ where: { id: fromAccountId } });
      if (src.balance < amount) throw new Error('INSUFFICIENT');

      await tx.bankAccount.update({ where: { id: fromAccountId }, data: { balance: { decrement: amount } } });
      const inc = await tx.bankAccount.update({ where: { id: toAccountId }, data: { balance: { increment: amount } } });

      const trans = await tx.transaction.create({
        data: {
          userId: req.userId,
          fromAccountId,
          toAccountId,
          amount,
          type: 'TRANSFER_OUT',
          category: 'Перевод',
          merchant: description || 'Между счетами',
          merchantIcon: 'swap_horiz',
          description: description || `Перевод между счетами`,
        },
      });

      return { trans, updatedTo: inc };
    });

    res.json({ success: true, transaction: result.trans });
  } catch (err) {
    if (err.message === 'INSUFFICIENT') {
      return res.status(400).json({ error: 'Недостаточно средств на момент списания' });
    }
    console.error('Transfer-own error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
