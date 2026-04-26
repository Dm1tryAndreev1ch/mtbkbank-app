const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { sacrificeCard, convertCardToPoints } = require('../services/cardEngine');
const { getCached, setCached } = require('../cache');
const { logger } = require('../logger');
const { reqValidator } = require('../middleware/reqValidator');
const { sacrificeSchema, convertSchema, buyCardSchema } = require('../schemas/cards');
const router = express.Router();

router.use(authMiddleware);

// GET /api/cards/collection
router.get('/collection', async (req, res) => {
  try {
    const { rarity } = req.query;
    const cacheKey = rarity ? `cards:collection:rarity:${rarity}` : 'cards:collection:all';
    const cachedData = await getCached(cacheKey);
    if (cachedData) return res.json(cachedData);

    const where = { isActive: true };
    if (rarity) where.rarity = rarity;

    const cards = await req.prisma.collectionCard.findMany({
      where,
      orderBy: [{ rarity: 'asc' }, { name: 'asc' }],
    });

    await setCached(cacheKey, cards, 300);
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/cards/inventory
router.get('/inventory', async (req, res) => {
  try {
    const { rarity, sort = 'date' } = req.query;

    const cards = await req.prisma.userCard.findMany({
      where: { userId: req.userId },
      include: {
        collectionCard: true,
        deckCards: { include: { deck: true } },
      },
      orderBy: sort === 'rarity'
        ? { collectionCard: { rarity: 'desc' } }
        : { acquiredAt: 'desc' },
    });

    const filtered = rarity
      ? cards.filter(c => c.collectionCard.rarity === rarity)
      : cards;

    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/cards/stats/rarities — MUST be above /:id
router.get('/stats/rarities', async (req, res) => {
  try {
    const cards = await req.prisma.userCard.findMany({
      where: { userId: req.userId },
      include: { collectionCard: { select: { rarity: true } } },
    });
    const stats = { COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0 };
    for (const c of cards) stats[c.collectionCard.rarity]++;
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/cards/buy
router.post('/buy', async (req, res) => {
  try {
    const { collectionCardId } = req.body;
    if (!collectionCardId) {
      return res.status(400).json({ error: 'Укажите collectionCardId' });
    }

    const collectionCard = await req.prisma.collectionCard.findFirst({
      where: { id: collectionCardId, isActive: true },
    });
    if (!collectionCard) {
      return res.status(404).json({ error: 'Карта не найдена или недоступна' });
    }

    const alreadyOwned = await req.prisma.userCard.findFirst({
      where: { userId: req.userId, collectionCardId },
    });
    if (alreadyOwned) {
      return res.status(400).json({ error: 'Эта карта уже есть в вашем инвентаре' });
    }

    const DEFAULT_PRICES = { COMMON: 300, RARE: 800, EPIC: 1500, LEGENDARY: 3500 };
    const price = collectionCard.mbPrice ?? DEFAULT_PRICES[collectionCard.rarity] ?? 500;

    const user = await req.prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    if ((user.mbPoints ?? 0) < price) {
      return res.status(400).json({ error: `Недостаточно MB. Нужно ${price}, есть ${user.mbPoints ?? 0}` });
    }

    const result = await req.prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: req.userId },
        data: { mbPoints: { decrement: price } },
      });

      // FIX: explicit source: 'SHOP' so CardSource enum is satisfied
      const userCard = await tx.userCard.create({
        data: {
          userId: req.userId,
          collectionCardId,
          health: collectionCard.maxHealth,
          source: 'SHOP',
        },
        include: { collectionCard: true },
      });

      return { userCard, mbPoints: updatedUser.mbPoints, price };
    });

    res.json(result);
  } catch (err) {
    (req.log ?? logger).error({ err }, 'buy card error');
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/cards/sacrifice — Phase 4 / 04-02 / B-M7
// reqValidator enforces both IDs are present strings; the route translates
// service-level errors with stable codes into the HTTP error contract.
router.post('/sacrifice', reqValidator(sacrificeSchema), async (req, res) => {
  try {
    const { sacrificeId, targetId } = req.validated;
    const result = await sacrificeCard(req.prisma, req.userId, sacrificeId, targetId);
    res.json(result);
  } catch (err) {
    if (err && err.code === 'SACRIFICE_OVERHEAL') {
      return res.status(400).json({
        error: 'SACRIFICE_OVERHEAL',
        message: err.userMessage || 'Целевая карта уже на максимуме HP',
      });
    }
    res.status(400).json({ error: err.message });
  }
});

// POST /api/cards/convert
router.post('/convert', async (req, res) => {
  try {
    const { cardId } = req.body;
    if (!cardId) return res.status(400).json({ error: 'Укажите карту' });
    const result = await convertCardToPoints(req.prisma, req.userId, cardId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/cards/:id — MUST remain last
router.get('/:id', async (req, res) => {
  try {
    const card = await req.prisma.userCard.findFirst({
      where: { id: req.params.id, userId: req.userId },
      include: {
        collectionCard: true,
        deckCards: { include: { deck: true } },
      },
    });
    if (!card) return res.status(404).json({ error: 'Карта не найдена' });
    res.json(card);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
