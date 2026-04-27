const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { getCached, setCached } = require('../cache');
const { logger } = require('../logger');
const { AppError } = require('../errors/AppError');
const router = express.Router();

const MAX_TRANSFER_AMOUNT = 1_000_000;

router.use(authMiddleware);

// GET /api/transactions
router.get('/', async (req, res) => {
  try {
    const { limit = 20, offset = 0, category, type } = req.query;
    // FIX: cap limit to prevent DoS via ORM
    const safeLimit = Math.min(parseInt(limit) || 20, 100);
    const safeOffset = Math.max(parseInt(offset) || 0, 0);
    const where = { userId: req.userId };
    if (category) where.category = category;
    if (type) where.type = type;

    const [transactions, total] = await Promise.all([
      req.prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: safeLimit,
        skip: safeOffset,
      }),
      req.prisma.transaction.count({ where }),
    ]);

    res.json({ transactions, total, limit: safeLimit, offset: safeOffset });
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

    // FIX: include PAYMENT and TRANSFER_OUT in addition to PURCHASE
    const transactions = await req.prisma.transaction.findMany({
      where: {
        userId: req.userId,
        type: { in: ['PURCHASE', 'PAYMENT', 'TRANSFER_OUT'] },
        createdAt: { gte: startDate },
      },
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
 * Resolves a phone number to a user + account.
 * Query: ?value=+37529...
 */
router.get('/resolve-recipient', async (req, res) => {
  try {
    const { value } = req.query;
    if (!value) return res.status(400).json({ error: 'Укажите номер телефона' });

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
        select: { id: true, name: true, avatarUrl: true },
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

    // Card-number based recipient resolution is intentionally disabled.
    // Using only masked PAN digits is unsafe and can route money to a wrong user.
    if (!user && /^\d{16}$/.test(clean)) {
      return res.status(400).json({ error: 'Перевод по номеру карты временно недоступен. Используйте телефон получателя.' });
    }

    if (!user || !account) {
      return res.status(404).json({ error: 'Получатель не найден' });
    }

    if (account.userId === req.userId) {
      return res.status(400).json({ error: 'Нельзя переводить самому себе через этот метод' });
    }

    // FIX: не возвращаем phone получателя — достаточно name + accountId
    res.json({
      user: { id: user.id, name: user.name, avatarUrl: user.avatarUrl },
      accountId: account.id,
    });
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Resolve recipient error');
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/**
 * POST /api/transactions/transfer
 * Supports two modes:
 *   1. { fromAccountId, toAccountId, amount, description }  — classic between known accounts
 *   2. { fromAccountId, recipient, amount, description }    — resolve by phone then transfer
 */
router.post('/transfer', async (req, res) => {
  try {
    const { fromAccountId, toAccountId: explicitToAccountId, recipient, amount: rawAmount, description } = req.body;
    const amount = parseFloat(rawAmount);

    if (!fromAccountId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Укажите счёт списания и сумму' });
    }

    // FIX: верхний лимит суммы перевода
    if (amount > MAX_TRANSFER_AMOUNT) {
      return res.status(400).json({ error: `Максимальная сумма одного перевода — ${MAX_TRANSFER_AMOUNT}` });
    }

    const fromAccount = await req.prisma.bankAccount.findFirst({
      where: { id: fromAccountId, userId: req.userId },
    });
    if (!fromAccount) return res.status(404).json({ error: 'Счёт отправителя не найден' });
    // Phase 4.5 / 04.5-01 / Task 2 / ADMIN-01 — frozen-account debit guard. The
    // BankAccount.frozen column lands in Migration A; admin freeze/unfreeze
    // toggles it. Outbound transfers must reject 423 LOCKED before any side
    // effect runs.
    if (fromAccount.frozen) throw new AppError('ACCOUNT_FROZEN', 423);

    // --- Resolve toAccountId ---
    let toAccountId = explicitToAccountId;
    let recipientUserId = null;

    if (!toAccountId && recipient) {
      const clean = String(recipient).replace(/[\s\-+]/g, '');
      let targetAccount = null;

      // By phone
      if (/^\d{10,12}$/.test(clean)) {
        const normalized = clean.startsWith('375') ? `+${clean}` : clean;
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

      // Card-number based recipient resolution is intentionally disabled.
      if (!targetAccount && /^\d{16}$/.test(clean)) {
        return res.status(400).json({ error: 'Перевод по номеру карты временно недоступен. Используйте телефон получателя.' });
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
    if (fromAccount.currency !== toAccount.currency) {
      return res.status(400).json({ error: 'Перевод между разными валютами не поддерживается' });
    }

    // FIX: проверка self-transfer применяется ВСЕГДА, независимо от mode
    if (toAccount.userId === req.userId) {
      return res.status(400).json({ error: 'Нельзя переводить самому себе через этот метод. Используйте «Между своими счетами».' });
    }

    // --- Atomic transfer including TRANSFER_IN record ---
    // FIX: TRANSFER_IN и уведомление создаются ВНУТРИ $transaction для атомарности
    const destUserId = recipientUserId || toAccount.userId;

    const result = await req.prisma.$transaction(async (tx) => {
      // Atomic guard against race conditions: decrement only if enough balance remains.
      const debitResult = await tx.bankAccount.updateMany({
        where: { id: fromAccountId, balance: { gte: amount } },
        data: { balance: { decrement: amount } },
      });
      if (debitResult.count !== 1) throw new Error('INSUFFICIENT');

      await tx.bankAccount.update({
        where: { id: toAccountId },
        data: { balance: { increment: amount } },
      });

      const transOut = await tx.transaction.create({
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

      // FIX: TRANSFER_IN теперь внутри той же транзакции
      const transIn = await tx.transaction.create({
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

      return { transOut, transIn };
    });

    // Уведомление — некритично, вне транзакции (Phase 4 / 04-02 / B-M8).
    // Failure is logged AND surfaced to the client via `notificationDeferred:true`
    // so observability + UI can react ("вам пришёл перевод, но уведомление мы
    // создадим позже"). Transaction itself MUST still succeed.
    let notificationDeferred = false;
    try {
      await req.prisma.notification.create({
        data: {
          userId: destUserId,
          title: '💸 Входящий перевод',
          body: `Вам поступил перевод ${amount} ${toAccount.currency}`,
          icon: 'account_balance_wallet',
        },
      });
    } catch (err) {
      (req.log ?? logger).error(
        { err, userId: destUserId, txId: result.transOut?.id },
        'Notification create failed',
      );
      notificationDeferred = true;
    }

    res.json({ success: true, transaction: result.transOut, notificationDeferred });
  } catch (err) {
    if (err.message === 'INSUFFICIENT') {
      return res.status(400).json({ error: 'Недостаточно средств на момент списания' });
    }
    (req.log ?? logger).error({ err }, 'Transfer error');
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/**
 * POST /api/transactions/transfer-own
 * Transfer between the authenticated user's own accounts.
 */
router.post('/transfer-own', async (req, res) => {
  try {
    const { fromAccountId, toAccountId, amount: rawAmount, description } = req.body;
    const amount = parseFloat(rawAmount);

    if (!fromAccountId || !toAccountId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Укажите оба счёта и сумму' });
    }
    if (fromAccountId === toAccountId) {
      return res.status(400).json({ error: 'Счета отправителя и получателя совпадают' });
    }
    if (amount > MAX_TRANSFER_AMOUNT) {
      return res.status(400).json({ error: `Максимальная сумма одного перевода — ${MAX_TRANSFER_AMOUNT}` });
    }

    // Both accounts must belong to this user
    const [fromAcc, toAcc] = await Promise.all([
      req.prisma.bankAccount.findFirst({ where: { id: fromAccountId, userId: req.userId } }),
      req.prisma.bankAccount.findFirst({ where: { id: toAccountId, userId: req.userId } }),
    ]);
    if (!fromAcc) return res.status(404).json({ error: 'Счёт списания не найден' });
    if (!toAcc) return res.status(404).json({ error: 'Счёт зачисления не найден' });
    // Phase 4.5 / 04.5-01 / Task 2 / ADMIN-01 — frozen-account debit guard.
    if (fromAcc.frozen) throw new AppError('ACCOUNT_FROZEN', 423);
    if (fromAcc.currency !== toAcc.currency) {
      return res.status(400).json({ error: 'Перевод между разными валютами не поддерживается' });
    }

    const result = await req.prisma.$transaction(async (tx) => {
      const debitResult = await tx.bankAccount.updateMany({
        where: { id: fromAccountId, balance: { gte: amount } },
        data: { balance: { decrement: amount } },
      });
      if (debitResult.count !== 1) throw new Error('INSUFFICIENT');

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
    (req.log ?? logger).error({ err }, 'Transfer-own error');
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
