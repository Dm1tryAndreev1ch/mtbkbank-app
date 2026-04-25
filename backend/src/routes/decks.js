const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { calculateDeckCashback } = require('../services/cardEngine');
const { getCached, setCached, invalidatePattern } = require('../cache');
const { logger } = require('../logger');
const router = express.Router();

router.use(authMiddleware);

// GET /api/decks
router.get('/', async (req, res) => {
  try {
    const decks = await req.prisma.deck.findMany({
      where: { userId: req.userId },
      include: {
        deckCards: {
          include: {
            userCard: { include: { collectionCard: true } },
          },
          orderBy: { slotIndex: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Add cashback totals
    const decksWithCashback = await Promise.all(
      decks.map(async (deck) => {
        const { totalCashback, breakdown } = await calculateDeckCashback(req.prisma, deck.id);
        return { ...deck, totalCashback, cashbackBreakdown: breakdown };
      })
    );

    res.json(decksWithCashback);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/decks
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Укажите название колоды' });

    const existingDecks = await req.prisma.deck.count({ where: { userId: req.userId } });
    const isFirst = existingDecks === 0;

    const deck = await req.prisma.deck.create({
      data: {
        userId: req.userId,
        name,
        isActive: isFirst,
      },
    });

    res.json(deck);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/decks/:id
router.put('/:id', async (req, res) => {
  try {
    const { name, cardIds } = req.body;
    const deck = await req.prisma.deck.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!deck) return res.status(404).json({ error: 'Колода не найдена' });

    if (name) {
      await req.prisma.deck.update({
        where: { id: deck.id },
        data: { name },
      });
    }

    if (cardIds) {
      if (cardIds.length > 5) {
        return res.status(400).json({ error: 'Максимум 5 карт в колоде' });
      }

      // Verify all cards belong to user
      const userCards = await req.prisma.userCard.findMany({
        where: { id: { in: cardIds }, userId: req.userId },
      });
      if (userCards.length !== cardIds.length) {
        return res.status(400).json({ error: 'Некоторые карты не найдены' });
      }

      // Check cards aren't in other decks
      const existingDeckCards = await req.prisma.deckCard.findMany({
        where: {
          userCardId: { in: cardIds },
          deckId: { not: deck.id },
        },
      });
      if (existingDeckCards.length > 0) {
        return res.status(400).json({ error: 'Некоторые карты уже в другой колоде' });
      }

      // Clear existing and set new
      await req.prisma.deckCard.deleteMany({ where: { deckId: deck.id } });
      await req.prisma.deckCard.createMany({
        data: cardIds.map((cardId, index) => ({
          deckId: deck.id,
          userCardId: cardId,
          slotIndex: index,
        })),
      });
    }

    const updated = await req.prisma.deck.findUnique({
      where: { id: deck.id },
      include: {
        deckCards: {
          include: { userCard: { include: { collectionCard: true } } },
          orderBy: { slotIndex: 'asc' },
        },
      },
    });

    const { totalCashback, breakdown } = await calculateDeckCashback(req.prisma, deck.id);
    await invalidatePattern(`deck:cashback:${deck.id}`);
    res.json({ ...updated, totalCashback, cashbackBreakdown: breakdown });
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Deck update error');
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/decks/:id/activate
router.put('/:id/activate', async (req, res) => {
  try {
    const deck = await req.prisma.deck.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!deck) return res.status(404).json({ error: 'Колода не найдена' });

    // Deactivate all other decks
    await req.prisma.deck.updateMany({
      where: { userId: req.userId },
      data: { isActive: false },
    });

    // Activate this one
    const activated = await req.prisma.deck.update({
      where: { id: deck.id },
      data: { isActive: true },
      include: {
        deckCards: {
          include: { userCard: { include: { collectionCard: true } } },
        },
      },
    });

    res.json(activated);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/decks/:id/cashback
router.get('/:id/cashback', async (req, res) => {
  try {
    const deck = await req.prisma.deck.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!deck) return res.status(404).json({ error: 'Колода не найдена' });

    const cacheKey = `deck:cashback:${deck.id}`;
    const cachedData = await getCached(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    const result = await calculateDeckCashback(req.prisma, deck.id);
    
    // Cache for 30 seconds
    await setCached(cacheKey, result, 30);
    
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/decks/:id
router.delete('/:id', async (req, res) => {
  try {
    const deck = await req.prisma.deck.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!deck) return res.status(404).json({ error: 'Колода не найдена' });

    await req.prisma.deck.delete({ where: { id: deck.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
