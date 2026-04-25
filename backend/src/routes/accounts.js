const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { logger } = require('../logger');
const router = express.Router();

router.use(authMiddleware);

// GET /api/accounts
router.get('/', async (req, res) => {
  try {
    const accounts = await req.prisma.bankAccount.findMany({
      where: { userId: req.userId },
      include: { bankCards: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/accounts/:id
router.get('/:id', async (req, res) => {
  try {
    const account = await req.prisma.bankAccount.findFirst({
      where: { id: req.params.id, userId: req.userId },
      include: { bankCards: true },
    });
    if (!account) return res.status(404).json({ error: 'Счёт не найден' });
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/accounts/:id/topup
router.post('/:id/topup', async (req, res) => {
  try {
    // FIX: parseFloat to handle string input, then validate
    const amount = parseFloat(req.body.amount);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Укажите корректную сумму' });
    }

    const account = await req.prisma.bankAccount.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!account) return res.status(404).json({ error: 'Счёт не найден' });

    // FIX: correct Transaction fields — userId + toAccountId, no stray accountId
    const [updatedAccount, transaction] = await req.prisma.$transaction([
      req.prisma.bankAccount.update({
        where: { id: account.id },
        data: { balance: { increment: amount } },
      }),
      req.prisma.transaction.create({
        data: {
          userId: req.userId,
          toAccountId: account.id,
          amount,
          type: 'TOPUP',
          category: 'Пополнение',
          merchant: 'Пополнение счёта',
          merchantIcon: 'add_card',
          description: `Пополнение на ${amount} ${account.currency}`,
        },
      }),
    ]);

    res.json({ account: updatedAccount, transaction });
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Topup error');
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
