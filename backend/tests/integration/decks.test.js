/**
 * Phase 2 — Plan 02-11 — Task 3
 *
 * TEST-02 + D-13: supertest coverage of /api/decks PUT.
 * Includes the rollback assertion — a validation failure must NOT leave orphan
 * DeckCard rows in the DB.
 *
 * Status of the rollback test today (2026-04-26): PASSES because the route
 * (backend/src/routes/decks.js) performs the ownership-validation check BEFORE
 * the deleteMany / createMany pair. Phase 3 REL-06 will additionally wrap the
 * mutation in prisma.$transaction so that even a runtime failure during
 * createMany (e.g., a unique-constraint violation on slotIndex) leaves the
 * deck in its pre-mutation state.
 *
 * Schema notes (read from backend/prisma/schema.prisma):
 *   - CollectionCard (catalog) — `cashbackPercent` (not cashbackBps), `brandIcon`,
 *     `brandName`, `rarity`, `mbValue`. NO `cashbackBps` field.
 *   - UserCard ownership — `userId`, `collectionCardId`, `health` (NOT `hp`).
 *   - DeckCard — `slotIndex` is required (not optional).
 */

const supertest = require('supertest');
const bcrypt = require('bcryptjs');
const { truncateAll, getPrisma } = require('../setup');

let app;
let prisma;

beforeAll(() => {
  jest.resetModules();
  app = require('../../src/index');
  prisma = getPrisma();
});

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
});

beforeEach(async () => {
  await truncateAll();
});

async function seedUserWithCardsAndDeck({
  phone = '+79991110001',
  pin = '1234',
} = {}) {
  const pinHash = await bcrypt.hash(pin, 10);
  const user = await prisma.user.create({
    data: { phone, pin: pinHash, name: 'Deck User', isAdmin: false, status: 'STANDARD' },
  });
  // Catalog: 5 collection cards.
  const cardDefs = await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      prisma.collectionCard.create({
        data: {
          name: `Card ${i + 1}`,
          brandName: `Brand ${i + 1}`,
          brandIcon: 'wallet',
          rarity: 'COMMON',
          cashbackPercent: 1.0,
          mbValue: 10,
          maxHealth: 100,
        },
      })
    )
  );
  // Ownership.
  const userCards = [];
  for (const cd of cardDefs) {
    userCards.push(
      await prisma.userCard.create({
        data: { userId: user.id, collectionCardId: cd.id, health: 100, source: 'PURCHASE' },
      })
    );
  }
  // Empty deck.
  const deck = await prisma.deck.create({
    data: { userId: user.id, name: 'Main', isActive: true },
  });
  const res = await supertest(app)
    .post('/api/auth/login')
    .send({ phone, pin });
  expect(res.status).toBe(200);
  return { accessToken: res.body.accessToken, user, deck, userCards };
}

describe('PUT /api/decks/:id', () => {
  test('happy path: 5 valid UserCards → 200 + 5 DeckCard rows', async () => {
    const { accessToken, deck, userCards } = await seedUserWithCardsAndDeck();
    const res = await supertest(app)
      .put(`/api/decks/${deck.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ cardIds: userCards.map((c) => c.id) });
    expect(res.status).toBe(200);
    const deckCardCount = await prisma.deckCard.count({ where: { deckId: deck.id } });
    expect(deckCardCount).toBe(5);
  });

  test('over-cap (>5 cards): returns 400 + ZERO DeckCard rows persist', async () => {
    const { accessToken, deck, userCards, user } = await seedUserWithCardsAndDeck();
    // Seed a 6th card so we can attempt cardIds.length=6.
    const cd = await prisma.collectionCard.create({
      data: {
        name: 'Card 6',
        brandName: 'Brand 6',
        brandIcon: 'wallet',
        rarity: 'COMMON',
        cashbackPercent: 1.0,
        mbValue: 10,
        maxHealth: 100,
      },
    });
    const sixth = await prisma.userCard.create({
      data: { userId: user.id, collectionCardId: cd.id, health: 100, source: 'PURCHASE' },
    });
    const res = await supertest(app)
      .put(`/api/decks/${deck.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ cardIds: [...userCards.map((c) => c.id), sixth.id] });
    expect(res.status).toBe(400);
    // Phase 3 (03-04 + 03-11): reqValidator(deckUpdateSchema) rejects with
    // { error: 'VALIDATION_FAILED', message: <generic codebook>, issues: [{path:['cardIds'], message:'Максимум 5 карт в колоде'}] }.
    // The Zod issue surfaces the over-cap signal — pin both the code and the issue path/message.
    expect(res.body.error).toBe('VALIDATION_FAILED');
    expect(Array.isArray(res.body.issues)).toBe(true);
    const cardIdsIssue = res.body.issues.find((i) => Array.isArray(i.path) && i.path.includes('cardIds'));
    expect(cardIdsIssue).toBeDefined();
    expect(cardIdsIssue.message).toMatch(/5/);
    const deckCardCount = await prisma.deckCard.count({ where: { deckId: deck.id } });
    expect(deckCardCount).toBe(0);
  });

  test('D-13 rollback: invalid card (not owned by user) → 4xx + ZERO DeckCard rows persist', async () => {
    const { accessToken, deck, userCards } = await seedUserWithCardsAndDeck();
    // Seed a separate user + card.
    const otherUser = await prisma.user.create({
      data: {
        phone: '+79999990000',
        pin: await bcrypt.hash('1234', 10),
        name: 'Other',
        isAdmin: false,
        status: 'STANDARD',
      },
    });
    const otherCardDef = await prisma.collectionCard.create({
      data: {
        name: 'OtherCard',
        brandName: 'Other',
        brandIcon: 'wallet',
        rarity: 'COMMON',
        cashbackPercent: 1.0,
        mbValue: 10,
        maxHealth: 100,
      },
    });
    const otherCard = await prisma.userCard.create({
      data: { userId: otherUser.id, collectionCardId: otherCardDef.id, health: 100, source: 'PURCHASE' },
    });

    const initialCount = await prisma.deckCard.count({ where: { deckId: deck.id } });

    // Mix 4 owned + 1 not-owned card → ownership validation should reject.
    const res = await supertest(app)
      .put(`/api/decks/${deck.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ cardIds: [...userCards.slice(0, 4).map((c) => c.id), otherCard.id] });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);

    // Rollback assertion: count must equal the initial (no orphan rows).
    const afterCount = await prisma.deckCard.count({ where: { deckId: deck.id } });
    expect(afterCount).toBe(initialCount);
  });

  test('rollback after a prior happy PUT: invalid card → existing 5 DeckCard rows remain intact', async () => {
    const { accessToken, deck, userCards, user } = await seedUserWithCardsAndDeck();
    // First, populate the deck with 5 valid cards.
    const happy = await supertest(app)
      .put(`/api/decks/${deck.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ cardIds: userCards.map((c) => c.id) });
    expect(happy.status).toBe(200);
    expect(await prisma.deckCard.count({ where: { deckId: deck.id } })).toBe(5);

    // Then try a bad mutation containing a non-owned card.
    const otherUser = await prisma.user.create({
      data: {
        phone: '+79999990001',
        pin: await bcrypt.hash('1234', 10),
        name: 'Other2',
        isAdmin: false,
        status: 'STANDARD',
      },
    });
    const otherCardDef = await prisma.collectionCard.create({
      data: {
        name: 'OtherCard2',
        brandName: 'Other2',
        brandIcon: 'wallet',
        rarity: 'COMMON',
        cashbackPercent: 1.0,
        mbValue: 10,
        maxHealth: 100,
      },
    });
    const otherCard = await prisma.userCard.create({
      data: { userId: otherUser.id, collectionCardId: otherCardDef.id, health: 100, source: 'PURCHASE' },
    });

    const bad = await supertest(app)
      .put(`/api/decks/${deck.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ cardIds: [...userCards.slice(0, 4).map((c) => c.id), otherCard.id] });
    expect(bad.status).toBeGreaterThanOrEqual(400);
    expect(bad.status).toBeLessThan(500);

    // Pre-existing 5 DeckCard rows must still be there (no partial deletion).
    const finalCount = await prisma.deckCard.count({ where: { deckId: deck.id } });
    expect(finalCount).toBe(5);
  });
});
