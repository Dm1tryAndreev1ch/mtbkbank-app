const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

// GET /api/users/me
router.get('/me', async (req, res) => {
  try {
    const user = await req.prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true, name: true, phone: true, avatarUrl: true,
        mbPoints: true, status: true, isAdmin: true, createdAt: true,
      },
    });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/users/me
router.put('/me', async (req, res) => {
  try {
    const { name, avatarUrl } = req.body;
    const user = await req.prisma.user.update({
      where: { id: req.userId },
      data: { ...(name && { name }), ...(avatarUrl && { avatarUrl }) },
      select: {
        id: true, name: true, phone: true, avatarUrl: true,
        mbPoints: true, status: true,
      },
    });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/users/me/stats
router.get('/me/stats', async (req, res) => {
  try {
    const [user, cardCount, tradeCount, questsClaimed, activeDeck] = await Promise.all([
      req.prisma.user.findUnique({
        where: { id: req.userId },
        select: { mbPoints: true, status: true },
      }),
      req.prisma.userCard.count({ where: { userId: req.userId } }),
      req.prisma.cardTrade.count({
        where: { fromUserId: req.userId, status: 'ACCEPTED' },
      }),
      req.prisma.questProgress.count({
        where: { userId: req.userId, claimed: true },
      }),
      req.prisma.deck.findFirst({
        where: { userId: req.userId, isActive: true },
        select: { cashbackRate: true },
      }),
    ]);

    res.json({
      mbPoints: user.mbPoints,
      status: user.status,
      totalCards: cardCount,
      completedTrades: tradeCount,
      questsCompleted: questsClaimed,
      activeCashback: activeDeck?.cashbackRate ?? 0,
    });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/users/search
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 3) return res.json([]);

    const users = await req.prisma.user.findMany({
      where: {
        id: { not: req.userId },
        OR: [
          { phone: { contains: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, phone: true, avatarUrl: true },
      take: 10,
    });

    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
