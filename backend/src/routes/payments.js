const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { processCardDrop } = require('../services/cardEngine');
const { invalidatePattern } = require('../cache');
const router = express.Router();

router.use(authMiddleware);

// GET /api/payments/categories
router.get('/categories', async (req, res) => {
  try {
    const config = await req.prisma.systemConfig.findUnique({
      where: { key: 'payment_categories' },
    });

    const defaultCategories = [
      { id: 'utilities', name: 'Коммунальные', icon: 'bolt', description: 'Электричество, Вода, Газ' },
      { id: 'shopping', name: 'Покупки', icon: 'shopping_bag', description: 'Бренды, Розница' },
      { id: 'streaming', name: 'Стриминг', icon: 'subscriptions', description: 'Развлечения и Медиа' },
      { id: 'investing', name: 'Инвестиции', icon: 'show_chart', description: 'Управление портфелем' },
      { id: 'transport', name: 'Транспорт', icon: 'directions_car', description: 'Такси, Метро, Топливо' },
      { id: 'restaurants', name: 'Кафе и Рестораны', icon: 'restaurant', description: 'Еда вне дома' },
    ];

    res.json(config ? JSON.parse(config.value) : defaultCategories);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/payments — make a payment
router.post('/', async (req, res) => {
  try {
    const { accountId, amount, category, merchant, merchantIcon, description, scheduledAt } = req.body;

    if (!accountId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Укажите счёт и сумму' });
    }

    const account = await req.prisma.bankAccount.findFirst({
      where: { id: accountId, userId: req.userId },
    });
    if (!account) return res.status(404).json({ error: 'Счёт не найден' });

    // Scheduled payment
    if (scheduledAt) {
      const transaction = await req.prisma.transaction.create({
        data: {
          userId: req.userId,
          fromAccountId: accountId,
          amount,
          type: 'PAYMENT',
          category: category || 'Оплата',
          merchant: merchant || 'Платёж',
          merchantIcon: merchantIcon || 'payments',
          description,
          status: 'scheduled',
          scheduledAt: new Date(scheduledAt),
        },
      });
      return res.json({ transaction, scheduled: true });
    }

    if (account.balance < amount) {
      return res.status(400).json({ error: 'Недостаточно средств' });
    }

    // Execute atomic validation locking exact decimal values against rapid taps
    const result = await req.prisma.$transaction(async (tx) => {
       const uAcc = await tx.bankAccount.update({
         where: { id: accountId },
         data: { balance: { decrement: amount } },
       });
       
       if (uAcc.balance < 0) {
          throw new Error('Недостаточно средств на момент оплаты');
       }

       const trans = await tx.transaction.create({
         data: {
           userId: req.userId,
           fromAccountId: accountId,
           amount,
           type: 'PURCHASE',
           category: category || 'Оплата',
           merchant: merchant || 'Платёж',
           merchantIcon: merchantIcon || 'payments',
           description,
         },
       });

       return { updatedAccount: uAcc, transaction: trans };
    });

    const { updatedAccount, transaction } = result;

    // Update spending limits
    if (category) {
      await req.prisma.spendingLimit.updateMany({
        where: { userId: req.userId, category },
        data: { spentAmount: { increment: amount } },
      });
    }

    // Try card drop
    const droppedCard = await processCardDrop(req.prisma, req.userId, transaction.id);

    // Bust analytics cache so next request gets fresh data
    await invalidatePattern(`analytics:${req.userId}:*`);

    res.json({
      account: updatedAccount,
      transaction,
      droppedCard: droppedCard ? {
        id: droppedCard.id,
        name: droppedCard.collectionCard.name,
        rarity: droppedCard.collectionCard.rarity,
        brandName: droppedCard.collectionCard.brandName,
      } : null,
    });
  } catch (err) {
    if (err.message === 'Недостаточно средств на момент оплаты') {
       return res.status(400).json({ error: err.message });
    }
    console.error('Payment error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/payments/scheduled
router.get('/scheduled', async (req, res) => {
  try {
    const payments = await req.prisma.transaction.findMany({
      where: {
        userId: req.userId,
        status: 'scheduled',
      },
      orderBy: { scheduledAt: 'asc' },
    });
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
