const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { calculateDeckCashback } = require('../services/cardEngine');
const { updateDeckCards } = require('../services/deckMutation');
const { reqValidator } = require('../middleware/reqValidator');
const { deckUpdateSchema } = require('../schemas/decks');
const { getCached, setCached, invalidatePattern } = require('../cache');
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
// REL-06 / B-H2: validate→deleteMany→createMany are wrapped in a single
// prisma.$transaction inside services/deckMutation.js → no orphan-row window.
// reqValidator(deckUpdateSchema) enforces { name?, cardIds? max 5 } at the edge.
router.put('/:id', reqValidator(deckUpdateSchema), async (req, res, next) => {
  try {
    const updated = await updateDeckCards(req.prisma, {
      deckId: req.params.id,
      userId: req.userId,
      name: req.validated.name,
      cardIds: req.validated.cardIds,
    });
    const { totalCashback, breakdown } = await calculateDeckCashback(req.prisma, updated.id);
    await invalidatePattern(`deck:cashback:${updated.id}`);
    res.json({ ...updated, totalCashback, cashbackBreakdown: breakdown });
  } catch (err) {
    next(err);
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
