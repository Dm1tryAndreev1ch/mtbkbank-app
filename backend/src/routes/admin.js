const express = require('express');
const bcrypt = require('bcryptjs');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { processCardDrop } = require('../services/cardEngine');
const router = express.Router();

router.use(authMiddleware);
router.use(adminMiddleware);

// ==================== USERS ====================

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const users = await req.prisma.user.findMany({
      select: {
        id: true, name: true, phone: true, mbPoints: true,
        status: true, isAdmin: true, createdAt: true,
        _count: { select: { userCards: true, accounts: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
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

    // Create default main account
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

// PUT /api/admin/cards/:id
// FIX: whitelist полей — mass assignment устранён
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
router.post('/grant-card', async (req, res) => {
  try {
    const { userId, collectionCardId } = req.body;
    const card = await req.prisma.collectionCard.findUnique({
      where: { id: collectionCardId },
    });
    if (!card) return res.status(404).json({ error: 'Шаблон карты не найден' });

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

// ==================== USER ACCOUNTS (for admin) ====================

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

    // Auto-select main account if accountId not provided
    if (!accountId) {
      const mainAccount = await req.prisma.bankAccount.findFirst({
        where: { userId, type: 'main' },
      });
      if (!mainAccount) {
        const anyAccount = await req.prisma.bankAccount.findFirst({ where: { userId } });
        if (!anyAccount) return res.status(404).json({ error: 'У пользователя нет счетов' });
        accountId = anyAccount.id;
      } else {
        accountId = mainAccount.id;
      }
    }

    const account = await req.prisma.bankAccount.findFirst({
      where: { id: accountId, userId },
    });
    if (!account) return res.status(404).json({ error: 'Счёт не найден' });

    // Determine balance operation based on transaction type
    const isCredit = type === 'TRANSFER_IN' || type === 'TOPUP';
    const balanceOp = isCredit ? { increment: amount } : { decrement: amount };
    const txType = type || 'PURCHASE';

    const merchantIcons = {
      PURCHASE: 'shopping_bag',
      TRANSFER_IN: 'account_balance_wallet',
      TOPUP: 'add_card',
    };

    const descriptions = {
      PURCHASE: `Имитация покупки: ${merchant || 'Тестовый магазин'}`,
      TRANSFER_IN: `Имитация входящего перевода: ${merchant || 'Перевод'}`,
      TOPUP: `Имитация пополнения: ${merchant || 'Пополнение'}`,
    };

    const [updatedAccount, transaction] = await req.prisma.$transaction([
      req.prisma.bankAccount.update({
        where: { id: accountId },
        data: { balance: balanceOp },
      }),
      req.prisma.transaction.create({
        data: {
          userId,
          fromAccountId: isCredit ? undefined : accountId,
          toAccountId: isCredit ? accountId : undefined,
          amount,
          type: txType,
          category: category || (isCredit ? 'Перевод' : 'Покупки'),
          merchant: merchant || (isCredit ? 'Входящий перевод' : 'Тестовый магазин'),
          merchantIcon: merchantIcon || merchantIcons[txType] || 'shopping_bag',
          description: descriptions[txType] || `Имитация: ${merchant}`,
        },
      }),
    ]);

    // Process card drop (only for purchases)
    let droppedCard = null;
    if (txType === 'PURCHASE') {
      droppedCard = await processCardDrop(req.prisma, userId, transaction.id);
    }

    res.json({
      account: updatedAccount,
      transaction,
      droppedCard: droppedCard ? {
        id: droppedCard.id,
        name: droppedCard.collectionCard.name,
        rarity: droppedCard.collectionCard.rarity,
      } : null,
    });
  } catch (err) {
    console.error('Simulate transaction error:', err);
    res.status(500).json({ error: 'Ошибка имитации' });
  }
});

// ==================== QUESTS ====================

// GET /api/admin/quests
router.get('/quests', async (req, res) => {
  try {
    const quests = await req.prisma.quest.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(quests);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/admin/quests
// FIX: whitelist полей — mass assignment устранён
router.post('/quests', async (req, res) => {
  try {
    const { title, description, type, target, reward, isActive } = req.body;
    const quest = await req.prisma.quest.create({
      data: { title, description, type, target, reward, isActive },
    });
    res.json(quest);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка создания квеста' });
  }
});

// PUT /api/admin/quests/:id
// FIX: whitelist полей — mass assignment устранён
router.put('/quests/:id', async (req, res) => {
  try {
    const { title, description, type, target, reward, isActive } = req.body;
    const data = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (type !== undefined) data.type = type;
    if (target !== undefined) data.target = target;
    if (reward !== undefined) data.reward = reward;
    if (isActive !== undefined) data.isActive = isActive;

    const quest = await req.prisma.quest.update({
      where: { id: req.params.id },
      data,
    });
    res.json(quest);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка обновления' });
  }
});

// ==================== SYSTEM CONFIG ====================

// GET /api/admin/config
router.get('/config', async (req, res) => {
  try {
    const configs = await req.prisma.systemConfig.findMany();
    const configMap = {};
    for (const c of configs) {
      try { configMap[c.key] = JSON.parse(c.value); }
      catch { configMap[c.key] = c.value; }
    }
    res.json(configMap);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/admin/config/:key
router.put('/config/:key', async (req, res) => {
  try {
    const { value } = req.body;
    const config = await req.prisma.systemConfig.upsert({
      where: { key: req.params.key },
      update: { value: JSON.stringify(value) },
      create: { key: req.params.key, value: JSON.stringify(value) },
    });
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ==================== DASHBOARD ====================

// GET /api/admin/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const [userCount, cardCount, totalMB, transactionCount, activeDecks] = await Promise.all([
      req.prisma.user.count(),
      req.prisma.userCard.count(),
      req.prisma.user.aggregate({ _sum: { mbPoints: true } }),
      req.prisma.transaction.count(),
      req.prisma.deck.count({ where: { isActive: true } }),
    ]);

    // Rarity distribution
    const cards = await req.prisma.userCard.findMany({
      include: { collectionCard: { select: { rarity: true } } },
    });
    const rarityDist = { COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0 };
    for (const c of cards) rarityDist[c.collectionCard.rarity]++;

    res.json({
      totalUsers: userCount,
      totalCards: cardCount,
      totalMBInCirculation: totalMB._sum.mbPoints || 0,
      totalTransactions: transactionCount,
      activeDecks,
      rarityDistribution: rarityDist,
    });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ==================== EXTENDED DASHBOARD ====================

// GET /api/admin/dashboard/extended
router.get('/dashboard/extended', async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Transaction volume per day (last 30 days)
    const allTransactions = await req.prisma.transaction.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { amount: true, type: true, createdAt: true, category: true, merchant: true },
      orderBy: { createdAt: 'desc' },
    });

    const dailyVolume = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      dailyVolume[key] = { date: key, count: 0, volume: 0 };
    }
    for (const t of allTransactions) {
      const key = new Date(t.createdAt).toISOString().slice(0, 10);
      if (dailyVolume[key]) {
        dailyVolume[key].count++;
        dailyVolume[key].volume += Math.abs(t.amount);
      }
    }

    // Top merchants
    const merchantMap = {};
    for (const t of allTransactions) {
      const m = t.merchant || 'Неизвестно';
      if (!merchantMap[m]) merchantMap[m] = { merchant: m, count: 0, volume: 0 };
      merchantMap[m].count++;
      merchantMap[m].volume += Math.abs(t.amount);
    }
    const topMerchants = Object.values(merchantMap)
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 5);

    // Type distribution
    const typeDistribution = {};
    for (const t of allTransactions) {
      if (!typeDistribution[t.type]) typeDistribution[t.type] = { type: t.type, count: 0, volume: 0 };
      typeDistribution[t.type].count++;
      typeDistribution[t.type].volume += Math.abs(t.amount);
    }

    // Recent 10 transactions
    const recentTransactions = await req.prisma.transaction.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, phone: true } },
      },
    });

    // New users this week
    const newUsersThisWeek = await req.prisma.user.count({
      where: { createdAt: { gte: sevenDaysAgo } },
    });

    // Total balance across all accounts
    const totalBalance = await req.prisma.bankAccount.aggregate({ _sum: { balance: true } });

    res.json({
      dailyVolume: Object.values(dailyVolume),
      topMerchants,
      typeDistribution: Object.values(typeDistribution),
      recentTransactions,
      newUsersThisWeek,
      totalBalance: totalBalance._sum.balance || 0,
    });
  } catch (err) {
    console.error('Extended dashboard error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ==================== TRANSACTIONS (ALL USERS) ====================

// GET /api/admin/transactions
router.get('/transactions', async (req, res) => {
  try {
    const { limit = 50, offset = 0, type, category, userId, search, dateFrom, dateTo, amountMin, amountMax } = req.query;
    // FIX: cap limit
    const safeLimit = Math.min(parseInt(limit) || 50, 200);

    const where = {};
    if (type) where.type = type;
    if (category) where.category = category;
    if (userId) where.userId = userId;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }
    if (amountMin || amountMax) {
      where.amount = {};
      if (amountMin) where.amount.gte = parseFloat(amountMin);
      if (amountMax) where.amount.lte = parseFloat(amountMax);
    }
    if (search) {
      where.OR = [
        { merchant: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [transactions, total] = await Promise.all([
      req.prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: safeLimit,
        skip: parseInt(offset) || 0,
        include: {
          user: { select: { id: true, name: true, phone: true } },
          fromAccount: { select: { id: true, name: true, balance: true } },
          toAccount: { select: { id: true, name: true, balance: true } },
        },
      }),
      req.prisma.transaction.count({ where }),
    ]);

    res.json({ transactions, total, limit: safeLimit, offset: parseInt(offset) || 0 });
  } catch (err) {
    console.error('Admin transactions error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/admin/transactions/:id
router.get('/transactions/:id', async (req, res) => {
  try {
    const transaction = await req.prisma.transaction.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { id: true, name: true, phone: true, status: true } },
        fromAccount: true,
        toAccount: true,
      },
    });
    if (!transaction) return res.status(404).json({ error: 'Транзакция не найдена' });
    res.json(transaction);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/admin/transactions/adjust
router.post('/transactions/adjust', async (req, res) => {
  try {
    const { userId, accountId, amount: rawAmount, reason, type = 'refund' } = req.body;
    const amount = parseFloat(rawAmount);
    if (!userId || isNaN(amount) || !reason) {
      return res.status(400).json({ error: 'Укажите userId, amount и reason' });
    }

    let targetAccountId = accountId;
    if (!targetAccountId) {
      const mainAccount = await req.prisma.bankAccount.findFirst({
        where: { userId, type: 'main' },
      });
      if (!mainAccount) return res.status(404).json({ error: 'У пользователя нет счетов' });
      targetAccountId = mainAccount.id;
    }

    const isRefund = type === 'refund';
    const adjustAmount = Math.abs(amount);

    const [updatedAccount, transaction] = await req.prisma.$transaction([
      req.prisma.bankAccount.update({
        where: { id: targetAccountId },
        data: { balance: isRefund ? { increment: adjustAmount } : { decrement: adjustAmount } },
      }),
      req.prisma.transaction.create({
        data: {
          userId,
          toAccountId: isRefund ? targetAccountId : undefined,
          fromAccountId: isRefund ? undefined : targetAccountId,
          amount: adjustAmount,
          type: 'ADMIN_ADJUSTMENT',
          category: isRefund ? 'Возврат' : 'Корректировка',
          merchant: `Администратор: ${reason}`,
          merchantIcon: 'admin_panel_settings',
          description: `${isRefund ? 'Возврат' : 'Списание'}: ${reason}`,
        },
      }),
    ]);

    // Notify user via WebSocket
    const { broadcastToUser } = require('../websocket');
    broadcastToUser(userId, 'balance_updated', {
      accountId: targetAccountId,
      newBalance: updatedAccount.balance,
      adjustment: { amount: adjustAmount, type, reason },
    });
    broadcastToUser(userId, 'transaction_adjusted', { transaction });

    res.json({ account: updatedAccount, transaction });
  } catch (err) {
    console.error('Adjust transaction error:', err);
    res.status(500).json({ error: 'Ошибка корректировки' });
  }
});

// GET /api/admin/transactions/analytics
router.get('/transactions/analytics', async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    const now = new Date();
    let startDate;

    if (period === 'week') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      startDate = new Date(now.getFullYear(), 0, 1);
    }

    const transactions = await req.prisma.transaction.findMany({
      where: { createdAt: { gte: startDate } },
    });

    const categories = {};
    let totalVolume = 0;
    let totalCount = transactions.length;
    const typeBreakdown = {};

    for (const t of transactions) {
      const cat = t.category || 'Другое';
      if (!categories[cat]) categories[cat] = { count: 0, volume: 0 };
      categories[cat].count++;
      categories[cat].volume += Math.abs(t.amount);
      totalVolume += Math.abs(t.amount);

      if (!typeBreakdown[t.type]) typeBreakdown[t.type] = { count: 0, volume: 0 };
      typeBreakdown[t.type].count++;
      typeBreakdown[t.type].volume += Math.abs(t.amount);
    }

    res.json({ totalVolume, totalCount, categories, typeBreakdown, period });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ==================== ACCOUNTS (ALL USERS) ====================

// GET /api/admin/accounts
router.get('/accounts', async (req, res) => {
  try {
    const accounts = await req.prisma.bankAccount.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, phone: true, status: true } },
        _count: { select: { bankCards: true } },
      },
    });
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/admin/accounts/:id/balance
router.put('/accounts/:id/balance', async (req, res) => {
  try {
    const { amount: rawAmount, reason } = req.body;
    // FIX: явный parseFloat + проверка на NaN; Math.abs исключает негативные корректировки без reason
    const amount = parseFloat(rawAmount);
    if (isNaN(amount) || !reason) {
      return res.status(400).json({ error: 'Укажите корректный amount и reason' });
    }

    const account = await req.prisma.bankAccount.findUnique({
      where: { id: req.params.id },
    });
    if (!account) return res.status(404).json({ error: 'Счёт не найден' });

    const adjustAmount = Math.abs(amount);
    const isPositive = amount >= 0;

    const [updatedAccount, transaction] = await req.prisma.$transaction([
      req.prisma.bankAccount.update({
        where: { id: req.params.id },
        data: { balance: isPositive ? { increment: adjustAmount } : { decrement: adjustAmount } },
      }),
      req.prisma.transaction.create({
        data: {
          userId: account.userId,
          toAccountId: isPositive ? req.params.id : undefined,
          fromAccountId: isPositive ? undefined : req.params.id,
          amount: adjustAmount,
          type: 'ADMIN_ADJUSTMENT',
          category: 'Корректировка баланса',
          merchant: `Администратор: ${reason}`,
          merchantIcon: 'admin_panel_settings',
          description: `Корректировка баланса: ${reason}`,
        },
      }),
    ]);

    // Notify user via WebSocket
    const { broadcastToUser } = require('../websocket');
    broadcastToUser(account.userId, 'balance_updated', {
      accountId: req.params.id,
      newBalance: updatedAccount.balance,
    });

    res.json({ account: updatedAccount, transaction });
  } catch (err) {
    console.error('Balance adjust error:', err);
    res.status(500).json({ error: 'Ошибка корректировки баланса' });
  }
});

// POST /api/admin/accounts/:userId
router.post('/accounts/:userId', async (req, res) => {
  try {
    const { name, type = 'main', balance = 0, currency = 'RUB' } = req.body;
    if (!name) return res.status(400).json({ error: 'Укажите название счёта' });

    const user = await req.prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    const account = await req.prisma.bankAccount.create({
      data: {
        userId: req.params.userId,
        name,
        type,
        balance: parseFloat(balance),
        currency,
      },
    });

    res.json(account);
  } catch (err) {
    console.error('Create account error:', err);
    res.status(500).json({ error: 'Ошибка создания счёта' });
  }
});

// ==================== BROADCAST NOTIFICATIONS ====================

// POST /api/admin/notifications/broadcast
router.post('/notifications/broadcast', async (req, res) => {
  try {
    const { title, body, icon = 'campaign', targetStatus, targetUserId } = req.body;
    if (!title || !body) {
      return res.status(400).json({ error: 'Укажите title и body' });
    }

    let userWhere = {};
    if (targetUserId) {
      userWhere = { id: targetUserId };
    } else if (targetStatus) {
      userWhere = { status: targetStatus };
    }

    const users = await req.prisma.user.findMany({
      where: userWhere,
      select: { id: true },
    });

    // Create notifications for all target users
    const notifications = await req.prisma.notification.createMany({
      data: users.map(u => ({
        userId: u.id,
        title,
        body,
        icon,
      })),
    });

    // Notify via WebSocket
    const { broadcastToUser } = require('../websocket');
    for (const u of users) {
      broadcastToUser(u.id, 'notification_broadcast', { title, body, icon });
    }

    res.json({ success: true, sentTo: users.length, notifications: notifications.count });
  } catch (err) {
    console.error('Broadcast error:', err);
    res.status(500).json({ error: 'Ошибка рассылки' });
  }
});

module.exports = router;
