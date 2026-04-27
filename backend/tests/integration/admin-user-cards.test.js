/**
 * Phase 4.5 / 04.5-03 / ADMIN-04 — admin UserCard endpoints integration test.
 *
 * Covers:
 *   GET    /api/admin/userCards/by-user/:userId   list inventory
 *   POST   /api/admin/userCards/grant             grant existing (CARD_GRANT)
 *   DELETE /api/admin/userCards/:id               revoke (USERCARD_REVOKE) +
 *                                                 DeckCard cascade cleanup
 *   PUT    /api/admin/userCards/:id/health        HP edit (USERCARD_HP_EDIT)
 *   rollback test on revoke.
 */

const supertest = require('supertest');
const jwt = require('jsonwebtoken');
const { truncateAll, getPrisma } = require('../setup');

let app;
let prisma;
let auditLog;

beforeAll(() => {
  jest.resetModules();
  app = require('../../src/index');
  auditLog = require('../../src/services/auditLog');
  prisma = getPrisma();
});

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
});

beforeEach(async () => {
  await truncateAll();
});

async function seed() {
  const admin = await prisma.user.create({
    data: { phone: '+79991234561', pin: 'h', name: 'Admin', isAdmin: true },
  });
  const target = await prisma.user.create({
    data: { phone: '+79991234562', pin: 'h', name: 'Target' },
  });
  const collectionCard = await prisma.collectionCard.create({
    data: {
      name: 'Test', description: 'd', rarity: 'COMMON',
      brandName: 'B', brandIcon: 'star', brandLogo: 'L', imageUrl: 'I',
      cashbackPercent: 5, mbValue: 10, maxHealth: 100, dropRate: 0.1,
    },
  });
  const userCard = await prisma.userCard.create({
    data: {
      userId: target.id,
      collectionCardId: collectionCard.id,
      health: 80,
      source: 'PURCHASE',
    },
  });
  const deck = await prisma.deck.create({
    data: { userId: target.id, name: 'Default', isActive: true },
  });
  const deckCard = await prisma.deckCard.create({
    data: { deckId: deck.id, userCardId: userCard.id, slotIndex: 0 },
  });
  const token = jwt.sign(
    { userId: admin.id, isAdmin: true },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
  return { admin, target, collectionCard, userCard, deck, deckCard, token };
}

describe('admin userCards (ADMIN-04, Phase-4.5 04.5-03)', () => {
  it('GET /api/admin/userCards/by-user/:userId returns inventory', async () => {
    const { token, target } = await seed();
    const res = await supertest(app)
      .get(`/api/admin/userCards/by-user/${target.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].userId).toBe(target.id);
    expect(res.body.items[0].collectionCard).toBeTruthy();
  });

  it('DELETE /:id revokes the user card and cascades DeckCard slots', async () => {
    const { admin, userCard, deck, token } = await seed();
    const res = await supertest(app)
      .delete(`/api/admin/userCards/${userCard.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ucAfter = await prisma.userCard.findUnique({ where: { id: userCard.id } });
    expect(ucAfter).toBeNull();
    const dcAfter = await prisma.deckCard.findMany({ where: { deckId: deck.id } });
    expect(dcAfter).toHaveLength(0);
    const audits = await prisma.auditLog.findMany({ where: { action: 'USERCARD_REVOKE' } });
    expect(audits).toHaveLength(1);
    expect(audits[0].actorId).toBe(admin.id);
    expect(audits[0].targetType).toBe('UserCard');
    expect(audits[0].targetId).toBe(userCard.id);
    expect(audits[0].payload.before.health).toBe(80);
    expect(audits[0].payload.before.deckCardCount).toBe(1);
  });

  it('PUT /:id/health clamps to [0, maxHealth] and audits USERCARD_HP_EDIT', async () => {
    const { userCard, token } = await seed();
    // 999 should clamp to 100 (maxHealth)
    const res = await supertest(app)
      .put(`/api/admin/userCards/${userCard.id}/health`)
      .set('Authorization', `Bearer ${token}`)
      .send({ health: 999 });
    expect(res.status).toBe(200);
    expect(res.body.health).toBe(100);
    const audits = await prisma.auditLog.findMany({ where: { action: 'USERCARD_HP_EDIT' } });
    expect(audits).toHaveLength(1);
    expect(audits[0].payload.before.health).toBe(80);
    expect(audits[0].payload.after.health).toBe(100);
  });

  it('PUT /:id/health rejects negative HP via Zod', async () => {
    const { userCard, token } = await seed();
    const res = await supertest(app)
      .put(`/api/admin/userCards/${userCard.id}/health`)
      .set('Authorization', `Bearer ${token}`)
      .send({ health: -1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_FAILED');
  });

  it('writeAudit throwing rolls back revoke (DeckCard + UserCard restored)', async () => {
    const { userCard, deck, token } = await seed();
    const original = auditLog.writeAudit;
    auditLog.writeAudit = async () => { throw new Error('simulated_audit_failure'); };
    try {
      const res = await supertest(app)
        .delete(`/api/admin/userCards/${userCard.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBeGreaterThanOrEqual(500);
    } finally {
      auditLog.writeAudit = original;
    }
    const ucAfter = await prisma.userCard.findUnique({ where: { id: userCard.id } });
    expect(ucAfter).not.toBeNull();
    const dcAfter = await prisma.deckCard.findMany({ where: { deckId: deck.id } });
    expect(dcAfter).toHaveLength(1);
  });

  it('POST /grant audits CARD_GRANT (existing migration preserved)', async () => {
    const { collectionCard, target, token } = await seed();
    // grant a NEW collection card (different one from the seeded UserCard)
    const card2 = await prisma.collectionCard.create({
      data: {
        name: 'Test2', description: 'd', rarity: 'RARE',
        brandName: 'B', brandIcon: 'star', brandLogo: 'L', imageUrl: 'I',
        cashbackPercent: 7, mbValue: 12, maxHealth: 100, dropRate: 0.05,
      },
    });
    const res = await supertest(app)
      .post('/api/admin/userCards/grant')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: target.id, collectionCardId: card2.id });
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(target.id);
    const audits = await prisma.auditLog.findMany({ where: { action: 'CARD_GRANT' } });
    expect(audits).toHaveLength(1);
    // Reference unused-but-checked seed values to silence linter when running in isolation.
    expect(collectionCard).toBeTruthy();
  });
});
