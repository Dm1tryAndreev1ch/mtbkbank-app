const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

// GET /api/trades
router.get('/', async (req, res) => {
  try {
    const { status = 'PENDING' } = req.query;
    const trades = await req.prisma.cardTrade.findMany({
      where: {
        OR: [
          { fromUserId: req.userId },
          { toUserId: req.userId },
        ],
        status,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(trades);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/trades — create trade offer
router.post('/', async (req, res) => {
  try {
    const { offeredCardId, requestedCardId, toUserId, mbPointsOffer = 0 } = req.body;

    if (!offeredCardId || !toUserId) {
      return res.status(400).json({ error: 'Укажите карту и получателя' });
    }

    const card = await req.prisma.userCard.findFirst({
      where: { id: offeredCardId, userId: req.userId },
    });
    if (!card) return res.status(404).json({ error: 'Карта не найдена' });

    if (mbPointsOffer > 0) {
      const user = await req.prisma.user.findUnique({ where: { id: req.userId } });
      if (user.mbPoints < mbPointsOffer) {
        return res.status(400).json({ error: 'Недостаточно MB points' });
      }
    }

    const trade = await req.prisma.cardTrade.create({
      data: {
        fromUserId: req.userId,
        toUserId,
        offeredCardId,
        requestedCardId,
        mbPointsOffer,
      },
    });

    await req.prisma.notification.create({
      data: {
        userId: toUserId,
        title: '🔄 Предложение обмена',
        body: 'Вам предложили обменять карточку! Проверьте раздел обменов.',
        icon: 'swap_horiz',
      },
    });

    res.json(trade);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/trades/:id/accept
router.put('/:id/accept', async (req, res) => {
  try {
    const trade = await req.prisma.cardTrade.findFirst({
      where: { id: req.params.id, toUserId: req.userId, status: 'PENDING' },
    });
    if (!trade) return res.status(404).json({ error: 'Обмен не найден' });

    // Pre-checks вне транзакции (только чтение, non-critical)
    const offeredCard = await req.prisma.userCard.findFirst({
      where: { id: trade.offeredCardId, userId: trade.fromUserId },
    });
    if (!offeredCard) {
      await req.prisma.cardTrade.update({ where: { id: trade.id }, data: { status: 'CANCELLED' } });
      return res.status(400).json({ error: 'Карта отправителя больше не доступна' });
    }

    if (trade.requestedCardId) {
      const requestedCard = await req.prisma.userCard.findFirst({
        where: { id: trade.requestedCardId, userId: req.userId },
      });
      if (!requestedCard) {
        await req.prisma.cardTrade.update({ where: { id: trade.id }, data: { status: 'CANCELLED' } });
        return res.status(400).json({ error: 'У вас больше нет запрашиваемой карты' });
      }
    }

    // Атомарное выполнение всех изменений
    // FIX: проверка mbPoints перенесена ВНУТРЬ $transaction — устранён TOCTOU race condition
    await req.prisma.$transaction(async (tx) => {
      // Re-read mbPoints inside transaction
      if (trade.mbPointsOffer > 0) {
        const freshFromUser = await tx.user.findUnique({ where: { id: trade.fromUserId } });
        if (freshFromUser.mbPoints < trade.mbPointsOffer) {
          throw new Error('INSUFFICIENT_MB');
        }
      }

      // Transfer offered card
      await tx.deckCard.deleteMany({ where: { userCardId: trade.offeredCardId } });
      await tx.userCard.update({
        where: { id: trade.offeredCardId },
        data: { userId: req.userId, source: 'TRADE' },
      });

      // Transfer requested card if exists
      if (trade.requestedCardId) {
        await tx.deckCard.deleteMany({ where: { userCardId: trade.requestedCardId } });
        await tx.userCard.update({
          where: { id: trade.requestedCardId },
          data: { userId: trade.fromUserId, source: 'TRADE' },
        });
      }

      // Transfer MB points if included
      if (trade.mbPointsOffer > 0) {
        await tx.user.update({
          where: { id: trade.fromUserId },
          data: { mbPoints: { decrement: trade.mbPointsOffer } },
        });
        await tx.user.update({
          where: { id: req.userId },
          data: { mbPoints: { increment: trade.mbPointsOffer } },
        });
      }

      await tx.cardTrade.update({
        where: { id: trade.id },
        data: { status: 'ACCEPTED' },
      });
    });

    res.json({ success: true });
  } catch (err) {
    if (err.message === 'INSUFFICIENT_MB') {
      return res.status(400).json({ error: 'У отправителя больше нет средств для этого обмена' });
    }
    console.error('Trade accept error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/trades/:id/reject
router.put('/:id/reject', async (req, res) => {
  try {
    const trade = await req.prisma.cardTrade.findFirst({
      where: { id: req.params.id, toUserId: req.userId, status: 'PENDING' },
    });
    if (!trade) return res.status(404).json({ error: 'Обмен не найден' });

    await req.prisma.cardTrade.update({
      where: { id: trade.id },
      data: { status: 'REJECTED' },
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/trades/send — send card as gift
// FIX: added check that card is not in an active deck before sending.
//      If it is, the user is warned and must remove it first.
router.post('/send', async (req, res) => {
  try {
    const { cardId, toUserId } = req.body;
    if (!cardId || !toUserId) {
      return res.status(400).json({ error: 'Укажите карту и получателя' });
    }

    const card = await req.prisma.userCard.findFirst({
      where: { id: cardId, userId: req.userId },
      include: {
        collectionCard: true,
        deckCards: { include: { deck: true } },
      },
    });
    if (!card) return res.status(404).json({ error: 'Карта не найдена' });

    // Warn if the card is in an active deck — user must remove it first
    const activeDeckEntry = card.deckCards.find(dc => dc.deck.isActive);
    if (activeDeckEntry) {
      return res.status(400).json({
        error: `Карта находится в активной колоде «${activeDeckEntry.deck.name}». Сначала удалите её из колоды.`,
      });
    }

    await req.prisma.$transaction(async (tx) => {
      await tx.deckCard.deleteMany({ where: { userCardId: cardId } });
      await tx.userCard.update({
        where: { id: cardId },
        data: { userId: toUserId, source: 'GIFT' },
      });
      await tx.cardTrade.create({
        data: {
          fromUserId: req.userId,
          toUserId,
          offeredCardId: cardId,
          status: 'ACCEPTED',
          isGift: true,
        },
      });
    });

    await req.prisma.notification.create({
      data: {
        userId: toUserId,
        title: '🎁 Подарок!',
        body: `Вам подарили карточку "${card.collectionCard.name}"!`,
        icon: 'card_giftcard',
      },
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
