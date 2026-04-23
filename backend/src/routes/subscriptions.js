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

// POST /api/subscriptions — create a new subscription
// FIX: добавлен эндпоинт создания (был заглушкой)
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
router.put('/:id', async (req, res) => {
  try {
    const { isActive } = req.body;
    const sub = await req.prisma.subscription.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!sub) return res.status(404).json({ error: 'Подписка не найдена' });

    const updated = await req.prisma.subscription.update({
      where: { id: sub.id },
      data: { isActive },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/subscriptions/:id — remove subscription
// FIX: добавлен эндпоинт удаления (был заглушкой)
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
