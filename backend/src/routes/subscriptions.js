const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

// GET /api/subscriptions
router.get('/', async (req, res) => {
  try {
    const subs = await req.prisma.subscription.findMany({
      where: { userId: req.userId },
      orderBy: { nextPayment: 'asc' },
    });
    res.json(subs);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/subscriptions
router.post('/', async (req, res) => {
  try {
    const { name, amount, currency = 'BYN', icon, category, nextPayment } = req.body;

    if (!name || !amount || amount <= 0 || !nextPayment) {
      return res.status(400).json({ error: 'Укажите название, сумму и дату следующего платежа' });
    }

    const sub = await req.prisma.subscription.create({
      data: {
        userId: req.userId,
        name,
        amount,
        currency,
        icon: icon || 'subscriptions',
        category: category || 'Другое',
        nextPayment: new Date(nextPayment),
        isActive: true,
      },
    });

    res.status(201).json(sub);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/subscriptions/:id
// FIX: allow editing core fields, not only isActive
router.put('/:id', async (req, res) => {
  try {
    const { name, amount, currency, icon, category, nextPayment, isActive } = req.body;
    const sub = await req.prisma.subscription.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!sub) return res.status(404).json({ error: 'Подписка не найдена' });

    const data = {};
    if (name !== undefined) data.name = name;
    if (amount !== undefined) {
      if (!amount || amount <= 0) return res.status(400).json({ error: 'Сумма должна быть больше 0' });
      data.amount = amount;
    }
    if (currency !== undefined) data.currency = currency;
    if (icon !== undefined) data.icon = icon;
    if (category !== undefined) data.category = category;
    if (nextPayment !== undefined) data.nextPayment = new Date(nextPayment);
    if (isActive !== undefined) data.isActive = isActive;

    const updated = await req.prisma.subscription.update({
      where: { id: sub.id },
      data,
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/subscriptions/:id
router.delete('/:id', async (req, res) => {
  try {
    const sub = await req.prisma.subscription.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!sub) return res.status(404).json({ error: 'Подписка не найдена' });

    await req.prisma.subscription.delete({ where: { id: sub.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
