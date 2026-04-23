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
    if (!user) return res.status(404).json({ error: '\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: '\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430' });
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
    res.status(500).json({ error: '\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430' });
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
      // UserQuest — \u043f\u0440\u0430\u0432\u0438\u043b\u044c\u043d\u043e\u0435 \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u043c\u043e\u0434\u0435\u043b\u0438 \u0438\u0437 schema.prisma
      req.prisma.userQuest.count({
        where: { userId: req.userId, claimed: true },
      }),
      // \u0410\u043a\u0442\u0438\u0432\u043d\u0430\u044f \u043a\u043e\u043b\u043e\u0434\u0430 \u0441 \u043a\u0430\u0440\u0442\u0430\u043c\u0438 \u0438 \u043f\u0440\u043e\u0446\u0435\u043d\u0442\u0430\u043c\u0438 \u043a\u044d\u0448\u0431\u044d\u043a\u0430
      req.prisma.deck.findFirst({
        where: { userId: req.userId, isActive: true },
        include: {
          deckCards: {
            include: {
              userCard: {
                include: { collectionCard: { select: { cashbackPercent: true } } },
              },
            },
          },
        },
      }),
    ]);

    // \u0421\u0443\u043c\u043c\u0430\u0440\u043d\u044b\u0439 \u043a\u044d\u0448\u0431\u044d\u043a \u043f\u043e \u0432\u0441\u0435\u043c \u043a\u0430\u0440\u0442\u0430\u043c \u0430\u043a\u0442\u0438\u0432\u043d\u043e\u0439 \u043a\u043e\u043b\u043e\u0434\u044b
    const activeCashback = activeDeck
      ? activeDeck.deckCards.reduce(
          (sum, dc) => sum + (dc.userCard?.collectionCard?.cashbackPercent ?? 0),
          0
        )
      : 0;

    res.json({
      mbPoints: user.mbPoints,
      status: user.status,
      totalCards: cardCount,
      completedTrades: tradeCount,
      questsCompleted: questsClaimed,
      activeCashback: Math.round(activeCashback * 10) / 10,
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: '\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430' });
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
    res.status(500).json({ error: '\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430' });
  }
});

module.exports = router;
