/**
 * Phase 4.5 / 04.5-04 / ADMIN-11 — admin trades list + cancel integration test.
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

afterAll(async () => { if (prisma) await prisma.$disconnect(); });
beforeEach(async () => { await truncateAll(); });

async function seed() {
  const admin = await prisma.user.create({
    data: { phone: '+79991230001', pin: 'h', name: 'Admin', isAdmin: true },
  });
  const userA = await prisma.user.create({
    data: { phone: '+79991230002', pin: 'h', name: 'Alice' },
  });
  const userB = await prisma.user.create({
    data: { phone: '+79991230003', pin: 'h', name: 'Bob' },
  });
  // CollectionCards for trade offered/requested ids.
  const card1 = await prisma.collectionCard.create({
    data: {
      name: 'C1', brandName: 'Brand', brandIcon: 'icon', rarity: 'COMMON', cashbackPercent: 1,
    },
  });
  const card2 = await prisma.collectionCard.create({
    data: {
      name: 'C2', brandName: 'Brand', brandIcon: 'icon', rarity: 'COMMON', cashbackPercent: 1,
    },
  });
  const adminToken = jwt.sign(
    { userId: admin.id, isAdmin: true },
    process.env.JWT_SECRET, { expiresIn: '15m' }
  );
  const userToken = jwt.sign(
    { userId: userA.id, isAdmin: false },
    process.env.JWT_SECRET, { expiresIn: '15m' }
  );
  return { admin, userA, userB, card1, card2, adminToken, userToken };
}

async function makeTrade(prisma, fromUserId, toUserId, offeredCardId, requestedCardId, status, createdAt) {
  return prisma.cardTrade.create({
    data: {
      fromUserId, toUserId, offeredCardId, requestedCardId,
      status,
      createdAt: createdAt || undefined,
    },
  });
}

describe('admin trades list (ADMIN-11)', () => {
  it('GET /api/admin/trades returns paged shape with all trades DESC', async () => {
    const { userA, userB, card1, card2, adminToken } = await seed();
    await makeTrade(prisma, userA.id, userB.id, card1.id, card2.id, 'PENDING');
    await makeTrade(prisma, userB.id, userA.id, card2.id, card1.id, 'ACCEPTED');
    const res = await supertest(app)
      .get('/api/admin/trades?page=1&limit=50')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.total).toBe(2);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(50);
  });

  it('GET ?status=PENDING filters', async () => {
    const { userA, userB, card1, card2, adminToken } = await seed();
    await makeTrade(prisma, userA.id, userB.id, card1.id, card2.id, 'PENDING');
    await makeTrade(prisma, userA.id, userB.id, card2.id, card1.id, 'ACCEPTED');
    const res = await supertest(app)
      .get('/api/admin/trades?status=PENDING')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].status).toBe('PENDING');
  });

  it('GET ?userId filters where fromUserId=:id OR toUserId=:id', async () => {
    const { userA, userB, card1, card2, adminToken } = await seed();
    const userC = await prisma.user.create({ data: { phone: '+79991230004', pin: 'h', name: 'C' } });
    await makeTrade(prisma, userA.id, userB.id, card1.id, card2.id, 'PENDING');
    await makeTrade(prisma, userB.id, userC.id, card2.id, card1.id, 'PENDING');
    await makeTrade(prisma, userC.id, userA.id, card1.id, card2.id, 'PENDING');
    const res = await supertest(app)
      .get(`/api/admin/trades?userId=${userA.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
  });

  it('GET ?from=...&to=... filters by createdAt range', async () => {
    const { userA, userB, card1, card2, adminToken } = await seed();
    await makeTrade(prisma, userA.id, userB.id, card1.id, card2.id, 'PENDING', new Date('2026-01-15'));
    await makeTrade(prisma, userA.id, userB.id, card1.id, card2.id, 'ACCEPTED', new Date('2026-06-15'));
    await makeTrade(prisma, userA.id, userB.id, card1.id, card2.id, 'CANCELLED', new Date('2025-06-15'));
    const res = await supertest(app)
      .get('/api/admin/trades?from=2026-01-01&to=2026-12-31')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
  });
});

describe('admin trade cancel (ADMIN-11)', () => {
  it('POST /:id/cancel on PENDING sets CANCELLED + writes TRADE_CANCEL audit', async () => {
    const { admin, userA, userB, card1, card2, adminToken } = await seed();
    const trade = await makeTrade(prisma, userA.id, userB.id, card1.id, card2.id, 'PENDING');
    const res = await supertest(app)
      .post(`/api/admin/trades/${trade.id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Спам обмена' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');

    const after = await prisma.cardTrade.findUnique({ where: { id: trade.id } });
    expect(after.status).toBe('CANCELLED');

    const audits = await prisma.auditLog.findMany({ where: { action: 'TRADE_CANCEL' } });
    expect(audits).toHaveLength(1);
    expect(audits[0].actorId).toBe(admin.id);
    expect(audits[0].targetType).toBe('CardTrade');
    expect(audits[0].targetId).toBe(trade.id);
    expect(audits[0].payload.before.status).toBe('PENDING');
    expect(audits[0].payload.after.status).toBe('CANCELLED');
    expect(audits[0].payload.reason).toBe('Спам обмена');
  });

  it('POST /:id/cancel on ACCEPTED returns 409 TRADE_NOT_CANCELLABLE', async () => {
    const { userA, userB, card1, card2, adminToken } = await seed();
    const trade = await makeTrade(prisma, userA.id, userB.id, card1.id, card2.id, 'ACCEPTED');
    const res = await supertest(app)
      .post(`/api/admin/trades/${trade.id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('TRADE_NOT_CANCELLABLE');
    const after = await prisma.cardTrade.findUnique({ where: { id: trade.id } });
    expect(after.status).toBe('ACCEPTED');
    const audits = await prisma.auditLog.findMany({ where: { action: 'TRADE_CANCEL' } });
    expect(audits).toHaveLength(0);
  });

  it('POST /:id/cancel on REJECTED returns 409 TRADE_NOT_CANCELLABLE', async () => {
    const { userA, userB, card1, card2, adminToken } = await seed();
    const trade = await makeTrade(prisma, userA.id, userB.id, card1.id, card2.id, 'REJECTED');
    const res = await supertest(app)
      .post(`/api/admin/trades/${trade.id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('TRADE_NOT_CANCELLABLE');
  });

  it('POST /:id/cancel on already-CANCELLED returns 409, no duplicate audit', async () => {
    const { userA, userB, card1, card2, adminToken } = await seed();
    const trade = await makeTrade(prisma, userA.id, userB.id, card1.id, card2.id, 'CANCELLED');
    const res = await supertest(app)
      .post(`/api/admin/trades/${trade.id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(409);
    const audits = await prisma.auditLog.findMany({ where: { action: 'TRADE_CANCEL' } });
    expect(audits).toHaveLength(0);
  });

  it('POST /:id/cancel on unknown id returns 404', async () => {
    const { adminToken } = await seed();
    const res = await supertest(app)
      .post('/api/admin/trades/non-existent-id/cancel')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('writeAudit throw rolls back: trade stays PENDING, no audit row', async () => {
    const { userA, userB, card1, card2, adminToken } = await seed();
    const trade = await makeTrade(prisma, userA.id, userB.id, card1.id, card2.id, 'PENDING');
    const original = auditLog.writeAudit;
    auditLog.writeAudit = async () => { throw new Error('simulated'); };
    try {
      const res = await supertest(app)
        .post(`/api/admin/trades/${trade.id}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(res.status).toBeGreaterThanOrEqual(500);
    } finally {
      auditLog.writeAudit = original;
    }
    const after = await prisma.cardTrade.findUnique({ where: { id: trade.id } });
    expect(after.status).toBe('PENDING');
    const audits = await prisma.auditLog.findMany({ where: { action: 'TRADE_CANCEL' } });
    expect(audits).toHaveLength(0);
  });

  it('non-admin JWT is rejected (T-04.5-04-04 admin auth chain)', async () => {
    const { userA, userB, card1, card2, userToken } = await seed();
    const trade = await makeTrade(prisma, userA.id, userB.id, card1.id, card2.id, 'PENDING');
    const res = await supertest(app)
      .post(`/api/admin/trades/${trade.id}/cancel`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({});
    expect([401, 403]).toContain(res.status);
    const after = await prisma.cardTrade.findUnique({ where: { id: trade.id } });
    expect(after.status).toBe('PENDING');
  });
});
