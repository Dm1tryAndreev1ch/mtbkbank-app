/**
 * Card Engine — core game mechanics for the card collection system.
 */

// Rarity-based configuration
const RARITY_CONFIG = {
  COMMON:    { dropChance: 0.60, mbValue: 10,   healthDecay: 2.0, healMultiplier: 0.5,  cashbackRange: [0.5, 1.5] },
  RARE:      { dropChance: 0.25, mbValue: 50,   healthDecay: 1.5, healMultiplier: 1.0,  cashbackRange: [1.5, 3.0] },
  EPIC:      { dropChance: 0.12, mbValue: 200,  healthDecay: 1.0, healMultiplier: 1.5,  cashbackRange: [3.0, 5.0] },
  LEGENDARY: { dropChance: 0.03, mbValue: 1000, healthDecay: 0.5, healMultiplier: 2.0,  cashbackRange: [5.0, 10.0] },
};

// Warning threshold: notify when health drops to or below this value
const HEALTH_WARNING_THRESHOLD = 30;

/**
 * Active deck HP drain — only cards slotted in the user’s active deck lose HP on a timer.
 *
 * Change tick interval: env ACTIVE_DECK_HP_TICK_MS in backend/.env (see .env.example).
 * Change HP lost per tick: ACTIVE_DECK_HP_LOSS_PER_TICK (default 1).
 * Change “low HP” threshold: ACTIVE_DECK_LOW_HP_THRESHOLD (default 30).
 */
const ACTIVE_DECK_LOW_HP_THRESHOLD = Math.max(
  1,
  parseInt(process.env.ACTIVE_DECK_LOW_HP_THRESHOLD || String(HEALTH_WARNING_THRESHOLD), 10) || HEALTH_WARNING_THRESHOLD
);

function getActiveDeckHpTickConfig() {
  const loss = parseInt(process.env.ACTIVE_DECK_HP_LOSS_PER_TICK || '1', 10);
  return {
    lossPerTick: Number.isFinite(loss) && loss > 0 ? loss : 1,
  };
}

const { sendPushNotification, sendCardDeathWarningPush } = require('../push');
const { broadcastToUser } = require('../websocket');

/**
 * Roll for a card drop after a purchase transaction.
 * Returns null or a rarity string.
 *
 * Two independent Math.random() calls:
 *   1st — did a drop happen? (< 0.30 = yes, 30% overall drop rate)
 *   2nd — which rarity? weighted against RARITY_CONFIG dropChance thresholds
 *         LEGENDARY < 0.03 | EPIC < 0.15 | RARE < 0.40 | COMMON otherwise
 */
function rollCardDrop(overrideRates = null) {
  const rates = overrideRates || RARITY_CONFIG;

  // First roll: did a drop happen at all?
  if (Math.random() >= 0.30) return null;

  // Second roll: which rarity?
  const rarityRoll = Math.random();
  if (rarityRoll < (rates.LEGENDARY?.dropChance ?? 0.03)) return 'LEGENDARY';
  if (rarityRoll < (rates.LEGENDARY?.dropChance ?? 0.03) + (rates.EPIC?.dropChance ?? 0.12)) return 'EPIC';
  if (rarityRoll < (rates.LEGENDARY?.dropChance ?? 0.03) + (rates.EPIC?.dropChance ?? 0.12) + (rates.RARE?.dropChance ?? 0.25)) return 'RARE';
  return 'COMMON';
}

/**
 * Select a random card of given rarity from available pool.
 */
async function selectRandomCard(prisma, rarity) {
  const cards = await prisma.collectionCard.findMany({
    where: { rarity, isActive: true },
  });
  if (cards.length === 0) return null;
  return cards[Math.floor(Math.random() * cards.length)];
}

/**
 * Process a card drop for a transaction.
 */
async function processCardDrop(prisma, userId, transactionId) {
  const rarity = rollCardDrop();
  if (!rarity) return null;

  const card = await selectRandomCard(prisma, rarity);
  if (!card) return null;

  const userCard = await prisma.userCard.create({
    data: {
      userId,
      collectionCardId: card.id,
      health: card.maxHealth,
      source: 'PURCHASE',
    },
    include: { collectionCard: true },
  });

  if (transactionId) {
    await prisma.transaction.update({
      where: { id: transactionId },
      data: { droppedCardId: userCard.id },
    });
  }

  const rarityNames = { COMMON: 'Обычная', RARE: 'Редкая', EPIC: 'Эпическая', LEGENDARY: 'Легендарная' };
  const user = await prisma.user.findUnique({ where: { id: userId } });

  await prisma.notification.create({
    data: {
      userId,
      title: '🎴 Новая карточка!',
      body: `Вы получили ${rarityNames[rarity]} карточку "${card.name}" от ${card.brandName}!`,
      icon: 'style',
    },
  });

  if (user?.expoPushToken) {
    await sendPushNotification(user.expoPushToken, '🎴 Новая карта!', `Вы выбили ${rarityNames[rarity]} карту из транзакции!`);
  }
  broadcastToUser(userId, 'CARD_DROP', { card: userCard });

  return userCard;
}

/**
 * Calculate total cashback percentage for a deck.
 */
async function calculateDeckCashback(prisma, deckId) {
  const deckCards = await prisma.deckCard.findMany({
    where: { deckId },
    include: {
      userCard: {
        include: { collectionCard: true },
      },
    },
  });

  let totalCashback = 0;
  const breakdown = [];

  for (const dc of deckCards) {
    const card = dc.userCard;
    if (card.health > 0) {
      const percent = card.collectionCard.cashbackPercent;
      totalCashback += percent;
      breakdown.push({
        cardName: card.collectionCard.name,
        rarity: card.collectionCard.rarity,
        cashbackPercent: percent,
        health: card.health,
        category: card.collectionCard.cashbackCategory,
      });
    }
  }

  return { totalCashback, breakdown };
}

/**
 * Decay all card health daily.
 * FIX: warning threshold changed from narrow "(20, 20+decay]" band
 *      to a fixed HEALTH_WARNING_THRESHOLD (30) so users reliably get notified.
 */
async function decayAllCardHealth(prisma) {
  let decayRates = {};
  try {
    const config = await prisma.systemConfig.findUnique({ where: { key: 'health_decay_rates' } });
    if (config) decayRates = JSON.parse(config.value);
  } catch (e) { /* use defaults */ }

  for (const [rarity, config] of Object.entries(RARITY_CONFIG)) {
    const decayAmount = decayRates[rarity] || config.healthDecay;

    // FIX: find cards whose health will drop to or below the warning threshold after this decay
    const warningCards = await prisma.userCard.findMany({
      where: {
        health: { gt: 0, lte: HEALTH_WARNING_THRESHOLD },
        collectionCard: { rarity },
      },
      include: { collectionCard: true, user: true },
    });

    for (const card of warningCards) {
      const newHealth = Math.max(0, card.health - decayAmount);
      if (card.user.expoPushToken) {
        await sendCardDeathWarningPush(card.user, card.collectionCard.name, newHealth);
      }
      broadcastToUser(card.userId, 'CARD_WARNING', { cardId: card.id, health: newHealth });
    }

    await prisma.$executeRaw`
      UPDATE "UserCard"
      SET health = GREATEST(0, health - ${decayAmount})
      WHERE health > 0
      AND "collectionCardId" IN (
        SELECT id FROM "CollectionCard" WHERE rarity = ${rarity}
      )
    `;
  }
}

/**
 * Remove cards that have reached 0 health.
 */
async function cleanupDeadCards(prisma) {
  const deadCards = await prisma.userCard.findMany({
    where: { health: { lte: 0 } },
    select: { id: true, userId: true, collectionCard: true },
  });

  for (const card of deadCards) {
    await prisma.deckCard.deleteMany({
      where: { userCardId: card.id },
    });
  }

  const result = await prisma.userCard.deleteMany({
    where: { health: { lte: 0 } },
  });

  const userIds = [...new Set(deadCards.map(c => c.userId))];
  for (const uid of userIds) {
    const count = deadCards.filter(c => c.userId === uid).length;
    await prisma.notification.create({
      data: {
        userId: uid,
        title: '💀 Карточки потеряны!',
        body: `${count} карточ(ек) потеряли всё здоровье и были уничтожены. Жертвуйте карты вовремя!`,
        icon: 'heart_broken',
      },
    });

    const user = await prisma.user.findUnique({ where: { id: uid } });
    if (user?.expoPushToken) {
      await sendPushNotification(user.expoPushToken, '💀 Карты уничтожены!', `${count} Ваших карт полностью потеряли здоровье и сгорели.`);
    }
  }

  return result.count;
}

/**
 * Decrease HP for user cards that are currently in an active deck (one tick per interval).
 * Creates in-app notifications when HP enters the low zone and when a card is destroyed.
 */
async function tickActiveDeckCardHealth(prisma) {
  const { lossPerTick } = getActiveDeckHpTickConfig();

  const activeDecks = await prisma.deck.findMany({
    where: { isActive: true },
    include: {
      deckCards: {
        include: {
          userCard: { include: { collectionCard: true } },
        },
      },
    },
  });

  for (const deck of activeDecks) {
    for (const dc of deck.deckCards) {
      const uc = dc.userCard;
      if (!uc || uc.health <= 0) continue;

      const oldHealth = uc.health;
      const newHealth = oldHealth - lossPerTick;

      if (newHealth <= 0) {
        await prisma.userCard.delete({ where: { id: uc.id } });
        await prisma.notification.create({
          data: {
            userId: uc.userId,
            title: '💀 Карта уничтожена',
            body: `Карта «${uc.collectionCard.name}» потеряла всё здоровье и исчезла из коллекции.`,
            icon: 'heart_broken',
          },
        });
        broadcastToUser(uc.userId, 'CARD_DESTROYED', {
          cardId: uc.id,
          reason: 'ZERO_HP',
        });
        continue;
      }

      await prisma.userCard.update({
        where: { id: uc.id },
        data: { health: newHealth },
      });

      const enteredLowZone = oldHealth > ACTIVE_DECK_LOW_HP_THRESHOLD && newHealth <= ACTIVE_DECK_LOW_HP_THRESHOLD;
      if (enteredLowZone) {
        await prisma.notification.create({
          data: {
            userId: uc.userId,
            title: '⚠️ Низкое здоровье карты',
            body: `Карта «${uc.collectionCard.name}» в активной колоде: осталось ${newHealth} HP.`,
            icon: 'warning',
          },
        });
        broadcastToUser(uc.userId, 'CARD_LOW_HP', {
          cardId: uc.id,
          health: newHealth,
        });
      }
    }
  }
}

/**
 * Sacrifice one card to heal another.
 */
async function sacrificeCard(prisma, userId, sacrificeId, targetId) {
  const sacrificeCard = await prisma.userCard.findFirst({
    where: { id: sacrificeId, userId },
    include: { collectionCard: true },
  });

  const targetCard = await prisma.userCard.findFirst({
    where: { id: targetId, userId },
    include: { collectionCard: true },
  });

  if (!sacrificeCard) throw new Error('Карта для жертвы не найдена');
  if (!targetCard) throw new Error('Целевая карта не найдена');
  if (sacrificeId === targetId) throw new Error('Нельзя жертвовать карту самой себе');

  const rarity = sacrificeCard.collectionCard.rarity;
  const healMultiplier = RARITY_CONFIG[rarity].healMultiplier;
  const healAmount = Math.floor(sacrificeCard.collectionCard.maxHealth * healMultiplier);
  const newHealth = Math.min(targetCard.collectionCard.maxHealth, targetCard.health + healAmount);

  const resultData = await prisma.$transaction(async (tx) => {
    await tx.deckCard.deleteMany({ where: { userCardId: sacrificeId } });
    await tx.userCard.delete({ where: { id: sacrificeId } });

    const updated = await tx.userCard.update({
      where: { id: targetId },
      data: { health: newHealth },
      include: { collectionCard: true },
    });
    return updated;
  });

  return { healAmount, newHealth, card: resultData };
}

/**
 * Convert a card to MB points.
 */
async function convertCardToPoints(prisma, userId, cardId) {
  const card = await prisma.userCard.findFirst({
    where: { id: cardId, userId },
    include: { collectionCard: true },
  });

  if (!card) throw new Error('Карта не найдена');

  const baseMB = card.collectionCard.mbValue;
  const healthBonus = Math.floor(baseMB * (card.health / card.collectionCard.maxHealth) * 0.5);
  const totalMB = baseMB + healthBonus;

  await prisma.$transaction(async (tx) => {
    await tx.deckCard.deleteMany({ where: { userCardId: cardId } });
    await tx.userCard.delete({ where: { id: cardId } });
    await tx.user.update({
      where: { id: userId },
      data: { mbPoints: { increment: totalMB } },
    });
  });

  return { baseMB, healthBonus, totalMB };
}

module.exports = {
  RARITY_CONFIG,
  rollCardDrop,
  selectRandomCard,
  processCardDrop,
  calculateDeckCashback,
  decayAllCardHealth,
  cleanupDeadCards,
  tickActiveDeckCardHealth,
  sacrificeCard,
  convertCardToPoints,
};
