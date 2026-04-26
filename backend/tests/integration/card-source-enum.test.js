/**
 * Phase 4 / 04-02 / B-M6 — POST /api/admin/grant-card rejects unknown source enum.
 *
 * The schemas/cards.js#sourceSchema mirrors Prisma `enum CardSource`. The admin
 * grant-card route runs reqValidator(grantCardSchema) which delegates the source
 * enum check to sourceSchema. Sending source='ZZZ_INVALID' must produce a 400
 * VALIDATION_FAILED-shaped response with issues mentioning 'source'.
 *
 * Valid enum value succeeds and persists with the requested source.
 */

const supertest = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
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

async function seedAdminAndUserAndCard() {
  const pinHash = await bcrypt.hash('0000', 10);
  const admin = await prisma.user.create({
    data: { phone: '+79990000000', pin: pinHash, name: 'Admin', isAdmin: true, status: 'STANDARD' },
  });
  const user = await prisma.user.create({
    data: { phone: '+79991111111', pin: pinHash, name: 'User', isAdmin: false, status: 'STANDARD' },
  });
  const card = await prisma.collectionCard.create({
    data: {
      name: 'Test Card', brandName: 'TestBrand', brandIcon: 'icon',
      rarity: 'COMMON', cashbackPercent: 1, mbValue: 100, maxHealth: 100,
    },
  });
  // Mint a fresh access token for the admin and stamp it so requireFreshAdmin (if any) accepts.
  const accessToken = jwt.sign(
    { userId: admin.id, isAdmin: true },
    process.env.JWT_SECRET,
    { expiresIn: '15m' },
  );
  return { admin, user, card, accessToken };
}

describe('B-M6 — admin grant-card source enum', () => {
  test("source='ZZZ_INVALID' → 400 VALIDATION_FAILED with 'source' in issues", async () => {
    const { user, card, accessToken } = await seedAdminAndUserAndCard();
    const res = await supertest(app)
      .post('/api/admin/grant-card')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ userId: user.id, collectionCardId: card.id, source: 'ZZZ_INVALID' });

    expect(res.status).toBe(400);
    const blob = JSON.stringify(res.body || {});
    expect(blob).toMatch(/VALIDATION/i);
    expect(blob).toMatch(/source/i);
  });

  test("valid source='QUEST' → 200 and userCard persisted with source=QUEST", async () => {
    const { user, card, accessToken } = await seedAdminAndUserAndCard();
    const res = await supertest(app)
      .post('/api/admin/grant-card')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ userId: user.id, collectionCardId: card.id, source: 'QUEST' });

    // Admin route returns 200 on success in the existing implementation.
    expect([200, 201]).toContain(res.status);
    const persisted = await prisma.userCard.findFirst({
      where: { userId: user.id, collectionCardId: card.id },
    });
    expect(persisted).not.toBeNull();
    expect(persisted.source).toBe('QUEST');
  });

  test('omitted source → 200 and defaults to ADMIN', async () => {
    const { user, card, accessToken } = await seedAdminAndUserAndCard();
    const res = await supertest(app)
      .post('/api/admin/grant-card')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ userId: user.id, collectionCardId: card.id });

    expect([200, 201]).toContain(res.status);
    const persisted = await prisma.userCard.findFirst({
      where: { userId: user.id, collectionCardId: card.id },
    });
    expect(persisted.source).toBe('ADMIN');
  });
});
