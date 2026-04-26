/**
 * Phase 3 — Plan 03-11 — REL-06 / B-H2.
 *
 * Deck mutation rollback: PUT /api/decks/:id wraps the entire
 * validate→deleteMany→createMany sequence in a single prisma.$transaction
 * via services/deckMutation.js. A validation failure (or any throw) inside
 * that block must roll back the deletion → no orphan DeckCard rows.
 */

const supertest = require('supertest');
const jwt = require('jsonwebtoken');
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

async function setup() {
  const pinHash = await bcrypt.hash('1234', 10);
  const u = await prisma.user.create({
    data: {
      phone: '+79991111120',
      pin: pinHash,
      name: 'A',
      isAdmin: false,
      status: 'STANDARD',
    },
  });
  const collections = await Promise.all(
    [0, 1, 2, 3, 4].map((i) =>
      prisma.collectionCard.create({
        data: {
          name: `C${i}`,
          brandName: `B${i}`,
          brandIcon: 'wallet',
          rarity: 'COMMON',
          cashbackPercent: 1.0,
          mbValue: 10,
          maxHealth: 100,
        },
      })
    )
  );
  const cards = await Promise.all(
    collections.map((cd) =>
      prisma.userCard.create({
        data: {
          userId: u.id,
          collectionCardId: cd.id,
          health: 100,
          source: 'PURCHASE',
        },
      })
    )
  );
  const deck = await prisma.deck.create({
    data: { userId: u.id, name: 'D', isActive: true },
  });
  await prisma.deckCard.createMany({
    data: [
      { deckId: deck.id, userCardId: cards[0].id, slotIndex: 0 },
      { deckId: deck.id, userCardId: cards[1].id, slotIndex: 1 },
    ],
  });
  return { u, deck, cards };
}

describe('deck mutation single transaction (REL-06)', () => {
  it('PUT with invalid (>5) cardIds rolls back; existing DeckCard rows preserved (B-H2)', async () => {
    const { u, deck, cards } = await setup();
    const token = jwt.sign(
      { userId: u.id, isAdmin: false },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    const beforeRows = await prisma.deckCard.count({ where: { deckId: deck.id } });
    expect(beforeRows).toBe(2);
    // Inject 6 ids — exceeds the 5-card cap; reqValidator must reject before any mutation runs.
    const tooMany = cards.map((c) => c.id).concat(['extra-fake-id']);
    const res = await supertest(app)
      .put(`/api/decks/${deck.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cardIds: tooMany });
    expect(res.status).toBe(400);
    const afterRows = await prisma.deckCard.count({ where: { deckId: deck.id } });
    expect(afterRows).toBe(2); // rolled back / never deleted
  });

  it('updateDeckCards is the single $transaction call site', async () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'services', 'deckMutation.js'), 'utf8');
    expect(src).toMatch(/prisma\.\$transaction/);
  });

  it('route handler delegates to services/deckMutation.js (no inline deleteMany/createMany in routes/decks.js)', async () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const routeSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'routes', 'decks.js'), 'utf8');
    expect(routeSrc).toMatch(/updateDeckCards/);
    // No inline deleteMany/createMany on deckCard in routes/decks.js
    // (allowed inside the SERVICE only).
    expect(routeSrc).not.toMatch(/req\.prisma\.deckCard\.(deleteMany|createMany)/);
  });

  it('happy path: PUT with valid cardIds atomically swaps the active set', async () => {
    const { u, deck, cards } = await setup();
    const token = jwt.sign(
      { userId: u.id, isAdmin: false },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    const newCardIds = [cards[2].id, cards[3].id, cards[4].id];
    const res = await supertest(app)
      .put(`/api/decks/${deck.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cardIds: newCardIds });
    expect(res.status).toBe(200);
    const after = await prisma.deckCard.findMany({
      where: { deckId: deck.id },
      orderBy: { slotIndex: 'asc' },
    });
    expect(after.map((d) => d.userCardId)).toEqual(newCardIds);
  });
});
