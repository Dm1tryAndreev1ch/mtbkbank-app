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

const { sendPushNotification, sendCardDeathWarningPush } = require('../push');
const { broadcastToUser } = require('../websocket');

/**
 * Roll for a card drop after a purchase transaction.
 * Returns null or a rarity string.
 * FIX: шанс выпадения карты исправлен — 30% (roll < 0.30), комментарий синхронизирован с кодом.
 */
function rollCardDrop(overrideRates = null) {
  const roll = Math.random();
  const rates = overrideRates || RARITY_CONFIG;

  // 30% chance to get ANY card on a purchase
  if (roll >= 0.30) return null;

  const rarityRoll = Math.random();
  let cumulative = 0;

  for (const [rarity, config] of Object.entries(rates)) {
    cumulative += config.dropChance;
    if (rarityRoll <= cumulative) {
      return rarity;
    }
  }
  return 'COMMON'; // fallback
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
 * FIX: устранён N+1 — обновление здоровья выполняется через updateMany по каждой редкости,
 * а не отдельным запросом на каждую карту. Карты с предупреждением обрабатываются отдельно.
 */
async function decayAllCardHealth(prisma) {
  let decayRates = {};
  try {
    const config = await prisma.systemConfig.findUnique({ where: { key: 'health_decay_rates' } });
    if (config) decayRates = JSON.parse(config.value);
  } catch (e) { /* use defaults */ }

  for (const [rarity, config] of Object.entries(RARITY_CONFIG)) {
    const decayAmount = decayRates[rarity] || config.healthDecay;

    // Найти карты, пересекающие порог 20 HP (нужен индивидуальный push)
    const warningCards = await prisma.userCard.findMany({
      where: {
        health: { gt: 20, lte: 20 + decayAmount },
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

    // Массовое обновление через raw SQL-подобный подход
    // Prisma не поддерживает computed updateMany, поэтому используем $executeRaw
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
  sacrificeCard,
  convertCardToPoints,
};
