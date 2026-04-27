/**
 * Phase 4.5 / 04.5-02 / ADMIN-09 — admin Subscription CRUD integration test.
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

async function seedAdminAndUser() {
  const admin = await prisma.user.create({
    data: { phone: '+79991234561', pin: 'h', name: 'Admin', isAdmin: true },
  });
  const user = await prisma.user.create({
    data: { phone: '+79991234562', pin: 'h', name: 'U' },
  });
  const token = jwt.sign(
    { userId: admin.id, isAdmin: true },
    process.env.JWT_SECRET, { expiresIn: '15m' }
  );
  return { admin, user, token };
}

describe('admin subscriptions (ADMIN-09)', () => {
  it('GET /api/admin/subscriptions returns paged shape', async () => {
    const { token } = await seedAdminAndUser();
    const res = await supertest(app)
      .get('/api/admin/subscriptions?page=1&limit=50')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body).toHaveProperty('total');
  });

  it('POST /api/admin/subscriptions creates with SUBSCRIPTION_CREATE audit', async () => {
    const { admin, user, token } = await seedAdminAndUser();
    const nextPayment = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const res = await supertest(app)
      .post('/api/admin/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        userId: user.id, name: 'Spotify', amount: 169,
        icon: 'music_note', nextPayment,
      });
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(user.id);
    expect(res.body.name).toBe('Spotify');
    expect(res.body.amount).toBe(169);
    const audits = await prisma.auditLog.findMany({ where: { action: 'SUBSCRIPTION_CREATE' } });
    expect(audits).toHaveLength(1);
    expect(audits[0].actorId).toBe(admin.id);
  });

  it('PUT /api/admin/subscriptions/:id updates with SUBSCRIPTION_UPDATE audit', async () => {
    const { user, token } = await seedAdminAndUser();
    const sub = await prisma.subscription.create({
      data: { userId: user.id, name: 'Netflix', amount: 599, icon: 'tv', nextPayment: new Date() },
    });
    const res = await supertest(app)
      .put(`/api/admin/subscriptions/${sub.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 799 });
    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(799);
    const audits = await prisma.auditLog.findMany({ where: { action: 'SUBSCRIPTION_UPDATE' } });
    expect(audits).toHaveLength(1);
    expect(audits[0].payload.before.amount).toBe(599);
    expect(audits[0].payload.after.amount).toBe(799);
  });

  it('DELETE /api/admin/subscriptions/:id removes row with SUBSCRIPTION_DELETE audit', async () => {
    const { user, token } = await seedAdminAndUser();
    const sub = await prisma.subscription.create({
      data: { userId: user.id, name: 'Apple Music', amount: 169, icon: 'music_note', nextPayment: new Date() },
    });
    const res = await supertest(app)
      .delete(`/api/admin/subscriptions/${sub.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    const after = await prisma.subscription.findUnique({ where: { id: sub.id } });
    expect(after).toBeNull();
    const audits = await prisma.auditLog.findMany({ where: { action: 'SUBSCRIPTION_DELETE' } });
    expect(audits).toHaveLength(1);
  });

  it('writeAudit-throw rolls back subscription delete', async () => {
    const { user, token } = await seedAdminAndUser();
    const sub = await prisma.subscription.create({
      data: { userId: user.id, name: 'X', amount: 100, icon: 'tv', nextPayment: new Date() },
    });
    const original = auditLog.writeAudit;
    auditLog.writeAudit = async () => { throw new Error('simulated'); };
    try {
      const res = await supertest(app)
        .delete(`/api/admin/subscriptions/${sub.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBeGreaterThanOrEqual(500);
    } finally {
      auditLog.writeAudit = original;
    }
    const after = await prisma.subscription.findUnique({ where: { id: sub.id } });
    expect(after).not.toBeNull();
  });
});
