/**
 * Phase 4 / 04-02 / B-M7 — POST /api/cards/sacrifice rejects sacrifice when target
 * is already at maxHealth (no overheal). Server caps newHealth via Math.min so
 * health never exceeds maxHealth.
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

async function seed({ targetHealth, sacrificeRarity = 'COMMON', maxHealth = 100 }) {
  const pinHash = await bcrypt.hash('1234', 10);
  const user = await prisma.user.create({
    data: { phone: '+79992222222', pin: pinHash, name: 'User', isAdmin: false, status: 'STANDARD' },
  });
  const tplA = await prisma.collectionCard.create({
    data: {
      name: 'Sacrifice', brandName: 'B', brandIcon: 'i',
      rarity: sacrificeRarity, cashbackPercent: 1, mbValue: 50, maxHealth,
    },
  });
  const tplB = await prisma.collectionCard.create({
    data: {
      name: 'Target', brandName: 'B2', brandIcon: 'i',
      rarity: 'COMMON', cashbackPercent: 1, mbValue: 50, maxHealth,
    },
  });
  const sacrifice = await prisma.userCard.create({
    data: { userId: user.id, collectionCardId: tplA.id, health: maxHealth, source: 'PURCHASE' },
  });
  const target = await prisma.userCard.create({
    data: { userId: user.id, collectionCardId: tplB.id, health: targetHealth, source: 'PURCHASE' },
  });
  const accessToken = jwt.sign(
    { userId: user.id, isAdmin: false },
    process.env.JWT_SECRET,
    { expiresIn: '15m' },
  );
  return { user, sacrifice, target, accessToken, maxHealth };
}

describe('B-M7 — sacrifice maxHealth guard', () => {
  test('target already at maxHealth → 400 SACRIFICE_OVERHEAL', async () => {
    const { sacrifice, target, accessToken } = await seed({ targetHealth: 100 });
    const res = await supertest(app)
      .post('/api/cards/sacrifice')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ sacrificeId: sacrifice.id, targetId: target.id });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('SACRIFICE_OVERHEAL');
  });

  test('target below maxHealth → 200 and newHealth never exceeds maxHealth', async () => {
    const { sacrifice, target, accessToken, maxHealth } = await seed({
      targetHealth: 80,
      sacrificeRarity: 'LEGENDARY', // higher heal multiplier
    });
    const res = await supertest(app)
      .post('/api/cards/sacrifice')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ sacrificeId: sacrifice.id, targetId: target.id });
    expect(res.status).toBe(200);
    expect(res.body.newHealth).toBeLessThanOrEqual(maxHealth);

    const persisted = await prisma.userCard.findUnique({ where: { id: target.id } });
    expect(persisted.health).toBeLessThanOrEqual(maxHealth);
    expect(persisted.health).toBeGreaterThan(80);
  });
});
