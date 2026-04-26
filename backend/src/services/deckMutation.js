// backend/src/services/deckMutation.js
// Phase 3 / REL-06 / B-H2 — atomic deck mutation in a single prisma.$transaction.
// Replaces the inline deleteMany→createMany sequence in routes/decks.js that could
// leave orphan rows on validation failure.
//
// Contract (preserved from routes/decks.js PUT /:id):
//   updateDeckCards(prisma, { deckId, userId, name?, cardIds? })
//   - Returns the deck with deckCards include (sorted by slotIndex asc).
//   - Throws AppError on: not-found (404), >5 cards, unowned cards, cross-deck collision.
//   - Atomic: any throw inside the $transaction rolls back the deleteMany so no
//     orphan DeckCard rows are left behind.

const { AppError } = require('../errors/AppError');

async function updateDeckCards(prisma, { deckId, userId, name, cardIds }) {
  return prisma.$transaction(async (tx) => {
    const deck = await tx.deck.findFirst({ where: { id: deckId, userId } });
    if (!deck) throw new AppError('NOT_FOUND', 404, 'Колода не найдена');

    // Optional rename
    if (name !== undefined && name !== deck.name) {
      await tx.deck.update({ where: { id: deckId }, data: { name } });
    }

    if (cardIds === undefined) {
      // Name-only edit; return current state.
      return tx.deck.findUnique({
        where: { id: deckId },
        include: {
          deckCards: {
            include: { userCard: { include: { collectionCard: true } } },
            orderBy: { slotIndex: 'asc' },
          },
        },
      });
    }

    // Validation (defensive — reqValidator already enforces .max(5) at the route).
    if (cardIds.length > 5) {
      throw new AppError('VALIDATION_FAILED', 400, 'Максимум 5 карт в колоде');
    }

    // Ownership check — every cardId must belong to the user.
    if (cardIds.length > 0) {
      const userCards = await tx.userCard.findMany({
        where: { id: { in: cardIds }, userId },
        select: { id: true },
      });
      if (userCards.length !== cardIds.length) {
        throw new AppError('VALIDATION_FAILED', 400, 'Некоторые карты не найдены');
      }

      // Cross-deck collision — a card cannot be in two decks at once.
      const collisions = await tx.deckCard.findMany({
        where: { userCardId: { in: cardIds }, deckId: { not: deckId } },
        select: { id: true },
      });
      if (collisions.length > 0) {
        throw new AppError('VALIDATION_FAILED', 400, 'Некоторые карты уже в другой колоде');
      }
    }

    // Atomic swap: deleteMany + createMany inside the SAME tx → no orphan window.
    await tx.deckCard.deleteMany({ where: { deckId } });
    if (cardIds.length > 0) {
      await tx.deckCard.createMany({
        data: cardIds.map((cardId, index) => ({
          deckId,
          userCardId: cardId,
          slotIndex: index,
        })),
      });
    }

    return tx.deck.findUnique({
      where: { id: deckId },
      include: {
        deckCards: {
          include: { userCard: { include: { collectionCard: true } } },
          orderBy: { slotIndex: 'asc' },
        },
      },
    });
  });
}

module.exports = { updateDeckCards };
