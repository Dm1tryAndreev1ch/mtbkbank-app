/**
 * Phase 4.5 / 04.5-02 / ADMIN-07 — admin SpendingLimit CRUD integration test.
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

describe('admin limits (ADMIN-07)', () => {
  it('GET /api/admin/limits returns paged shape', async () => {
    const { token } = await seedAdminAndUser();
    const res = await supertest(app)
      .get('/api/admin/limits?page=1&limit=50')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page', 1);
    expect(res.body).toHaveProperty('limit', 50);
  });

  it('POST /api/admin/limits creates with LIMIT_CREATE audit', async () => {
    const { admin, user, token } = await seedAdminAndUser();
    const res = await supertest(app)
      .post('/api/admin/limits')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: user.id, category: 'Food', amount: 5000, period: 'MONTHLY' });
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(user.id);
    expect(res.body.category).toBe('Food');
    expect(res.body.limitAmount).toBe(5000);
    expect(res.body.period).toBe('MONTHLY');
    const audits = await prisma.auditLog.findMany({ where: { action: 'LIMIT_CREATE' } });
    expect(audits).toHaveLength(1);
    expect(audits[0].actorId).toBe(admin.id);
  });

  it('PUT /api/admin/limits/:id updates with LIMIT_UPDATE audit', async () => {
    const { user, token } = await seedAdminAndUser();
    const created = await prisma.spendingLimit.create({
      data: { userId: user.id, category: 'Food', limitAmount: 1000, period: 'MONTHLY' },
    });
    const res = await supertest(app)
      .put(`/api/admin/limits/${created.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 7500 });
    expect(res.status).toBe(200);
    expect(res.body.limitAmount).toBe(7500);
    const audits = await prisma.auditLog.findMany({ where: { action: 'LIMIT_UPDATE' } });
    expect(audits).toHaveLength(1);
    expect(audits[0].payload.before.limitAmount).toBe(1000);
    expect(audits[0].payload.after.limitAmount).toBe(7500);
  });

  it('DELETE /api/admin/limits/:id removes row with LIMIT_DELETE audit', async () => {
    const { user, token } = await seedAdminAndUser();
    const created = await prisma.spendingLimit.create({
      data: { userId: user.id, category: 'Food', limitAmount: 1000, period: 'MONTHLY' },
    });
    const res = await supertest(app)
      .delete(`/api/admin/limits/${created.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    const after = await prisma.spendingLimit.findUnique({ where: { id: created.id } });
    expect(after).toBeNull();
    const audits = await prisma.auditLog.findMany({ where: { action: 'LIMIT_DELETE' } });
    expect(audits).toHaveLength(1);
    expect(audits[0].payload.before.id).toBe(created.id);
  });

  it('writeAudit-throw rolls back limit delete', async () => {
    const { user, token } = await seedAdminAndUser();
    const created = await prisma.spendingLimit.create({
      data: { userId: user.id, category: 'Food', limitAmount: 1000, period: 'MONTHLY' },
    });
    const original = auditLog.writeAudit;
    auditLog.writeAudit = async () => { throw new Error('simulated'); };
    try {
      const res = await supertest(app)
        .delete(`/api/admin/limits/${created.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBeGreaterThanOrEqual(500);
    } finally {
      auditLog.writeAudit = original;
    }
    const after = await prisma.spendingLimit.findUnique({ where: { id: created.id } });
    expect(after).not.toBeNull();
  });
});
