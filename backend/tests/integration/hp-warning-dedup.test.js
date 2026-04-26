/**
 * Phase 3 — Plan 03-13 — REL-11.
 *
 * HP-warning dedup: UserCard.lastWarningAt 24h gate.
 *
 * Contract:
 *   - First low-HP tick writes a notification + sets UserCard.lastWarningAt.
 *   - Second low-HP tick within 24h emits zero NEW notifications.
 *   - Tick after 24h elapsed re-emits one notification.
 */

const { truncateAll, getPrisma } = require('../setup');
const { tickActiveDeckCardHealth } = require('../../src/services/cardEngine');

let prisma;

beforeAll(() => {
  jest.resetModules();
  prisma = getPrisma();
});

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
});

beforeEach(async () => {
  await truncateAll();
});

async function setupLowHpDeck() {
  const u = await prisma.user.create({
    data: {
      phone: '+79991111150',
      pin: 'h',
      name: 'A',
      expoPushToken: 'ExpoPushToken[xxx]',
    },
  });
  const c = await prisma.collectionCard.create({
    data: {
      name: 'TestCard',
      brandName: 'TestBrand',
      brandIcon: 'star',
      rarity: 'COMMON',
      maxHealth: 100,
      mbValue: 10,
      cashbackPercent: 1,
      cashbackCategory: 'all',
    },
  });
  // Pre-set health JUST ABOVE the low-HP threshold (30) so the next tick crosses below.
  const uc = await prisma.userCard.create({
    data: {
      userId: u.id,
      collectionCardId: c.id,
      health: 31,
    },
  });
  const deck = await prisma.deck.create({
    data: { userId: u.id, name: 'D', isActive: true },
  });
  await prisma.deckCard.create({
    data: { deckId: deck.id, userCardId: uc.id, slotIndex: 0 },
  });
  return { u, uc };
}

describe('HP warning dedup (REL-11)', () => {
  it('first low-HP tick writes notification + sets UserCard.lastWarningAt', async () => {
    const { u, uc } = await setupLowHpDeck();
    await tickActiveDeckCardHealth(prisma);
    const updatedUc = await prisma.userCard.findUnique({ where: { id: uc.id } });
    expect(updatedUc.lastWarningAt).toBeTruthy();
    const notifs = await prisma.notification.findMany({
      where: { userId: u.id, title: { contains: 'Низкое' } },
    });
    expect(notifs.length).toBeGreaterThanOrEqual(1);
  });

  it('second tick within 24h emits zero new low-HP notifications', async () => {
    const { u, uc } = await setupLowHpDeck();
    await tickActiveDeckCardHealth(prisma);
    const notifsAfter1 = await prisma.notification.count({
      where: { userId: u.id, title: { contains: 'Низкое' } },
    });
    expect(notifsAfter1).toBeGreaterThanOrEqual(1);

    // Reset the card to the same low-HP-edge state so the second tick would
    // re-cross the threshold IF the dedup gate were not in place.
    await prisma.userCard.update({
      where: { id: uc.id },
      data: { health: 31 },
    });

    await tickActiveDeckCardHealth(prisma);
    const notifsAfter2 = await prisma.notification.count({
      where: { userId: u.id, title: { contains: 'Низкое' } },
    });
    expect(notifsAfter2).toBe(notifsAfter1);
  });

  it('tick after 24h elapsed re-emits one low-HP notification', async () => {
    const { u, uc } = await setupLowHpDeck();
    await tickActiveDeckCardHealth(prisma);
    const notifsBefore = await prisma.notification.count({
      where: { userId: u.id, title: { contains: 'Низкое' } },
    });

    // Backdate lastWarningAt > 24h and re-arm health to cross the threshold.
    await prisma.userCard.update({
      where: { id: uc.id },
      data: {
        health: 31,
        lastWarningAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      },
    });

    await tickActiveDeckCardHealth(prisma);
    const notifsAfter = await prisma.notification.count({
      where: { userId: u.id, title: { contains: 'Низкое' } },
    });
    expect(notifsAfter).toBe(notifsBefore + 1);
  });
});
