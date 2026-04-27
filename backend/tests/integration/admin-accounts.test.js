/**
 * Phase 4.5 / 04.5-02 / ADMIN-01 — admin accounts endpoints integration test.
 *
 * Covers:
 *   GET    /api/admin/accounts                    paged search shape
 *   POST   /api/admin/accounts/:id/freeze         frozen=true + audit row + rollback
 *   POST   /api/admin/accounts/:id/unfreeze       frozen=false + audit row
 *   POST   /api/admin/accounts/:id/balance-adjust delta atomic + audit row
 *   POST   /api/transactions/transfer (frozen)    423 ACCOUNT_FROZEN guard wired
 *
 * Harness mirrors backend/tests/integration/audit-log.test.js — JWT mint with
 * isAdmin:true, truncateAll between tests, supertest against the live app.
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

async function seedAdminAndUser() {
  const admin = await prisma.user.create({
    data: { phone: '+79991234561', pin: 'h', name: 'Admin', isAdmin: true },
  });
  const target = await prisma.user.create({
    data: { phone: '+79991234562', pin: 'h', name: 'Target' },
  });
  const account = await prisma.bankAccount.create({
    data: {
      userId: target.id,
      name: 'Основной',
      type: 'main',
      balance: 1000,
    },
  });
  const token = jwt.sign(
    { userId: admin.id, isAdmin: true },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
  return { admin, target, account, token };
}

describe('admin accounts (ADMIN-01, Phase-4.5 04.5-02)', () => {
  it('GET /api/admin/accounts returns { items, total, page, limit }', async () => {
    const { token, target } = await seedAdminAndUser();
    const res = await supertest(app)
      .get('/api/admin/accounts?page=1&limit=50')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page', 1);
    expect(res.body).toHaveProperty('limit', 50);
    expect(res.body.items.some((a) => a.userId === target.id)).toBe(true);
  });

  it('GET /api/admin/accounts requires admin token (401 without auth)', async () => {
    await seedAdminAndUser();
    const res = await supertest(app).get('/api/admin/accounts');
    expect(res.status).toBeGreaterThanOrEqual(401);
    expect(res.status).toBeLessThan(500);
  });

  it('POST /api/admin/accounts/:id/freeze sets frozen=true and writes audit row', async () => {
    const { admin, account, token } = await seedAdminAndUser();
    const res = await supertest(app)
      .post(`/api/admin/accounts/${account.id}/freeze`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'fraud check' });
    expect(res.status).toBe(200);
    expect(res.body.frozen).toBe(true);
    const after = await prisma.bankAccount.findUnique({ where: { id: account.id } });
    expect(after.frozen).toBe(true);
    const audits = await prisma.auditLog.findMany({ where: { action: 'ACCOUNT_FREEZE' } });
    expect(audits).toHaveLength(1);
    expect(audits[0].actorId).toBe(admin.id);
    expect(audits[0].targetType).toBe('BankAccount');
    expect(audits[0].targetId).toBe(account.id);
    expect(audits[0].payload.before.frozen).toBe(false);
    expect(audits[0].payload.after.frozen).toBe(true);
    expect(audits[0].payload.reason).toBe('fraud check');
  });

  it('frozen account blocks debit on /api/transactions/transfer with 423 ACCOUNT_FROZEN', async () => {
    const { target, account, token: adminToken } = await seedAdminAndUser();
    await supertest(app)
      .post(`/api/admin/accounts/${account.id}/freeze`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'block test' });

    const userToken = jwt.sign(
      { userId: target.id, isAdmin: false },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    const destUser = await prisma.user.create({
      data: { phone: '+79991234563', pin: 'h', name: 'Dest' },
    });
    const destAcc = await prisma.bankAccount.create({
      data: { userId: destUser.id, name: 'Dest', type: 'main', balance: 0 },
    });

    const res = await supertest(app)
      .post('/api/transactions/transfer')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ fromAccountId: account.id, toAccountId: destAcc.id, amount: 100 });
    expect(res.status).toBe(423);
    expect(res.body.error).toBe('ACCOUNT_FROZEN');
  });

  it('POST /api/admin/accounts/:id/unfreeze restores frozen=false with audit', async () => {
    const { account, token } = await seedAdminAndUser();
    await supertest(app)
      .post(`/api/admin/accounts/${account.id}/freeze`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    const res = await supertest(app)
      .post(`/api/admin/accounts/${account.id}/unfreeze`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.frozen).toBe(false);
    const audits = await prisma.auditLog.findMany({ where: { action: 'ACCOUNT_UNFREEZE' } });
    expect(audits).toHaveLength(1);
    expect(audits[0].payload.before.frozen).toBe(true);
    expect(audits[0].payload.after.frozen).toBe(false);
  });

  it('POST /api/admin/accounts/:id/balance-adjust applies signed delta with audit', async () => {
    const { account, token } = await seedAdminAndUser();
    const res = await supertest(app)
      .post(`/api/admin/accounts/${account.id}/balance-adjust`)
      .set('Authorization', `Bearer ${token}`)
      .send({ delta: 5000, reason: 'manual top-up' });
    expect(res.status).toBe(200);
    expect(res.body.balance).toBe(6000);
    const audits = await prisma.auditLog.findMany({ where: { action: 'ACCOUNT_BALANCE_ADJUST' } });
    expect(audits).toHaveLength(1);
    expect(audits[0].payload.before.balance).toBe(1000);
    expect(audits[0].payload.after.balance).toBe(6000);
    expect(audits[0].payload.reason).toBe('manual top-up');
  });

  it('balance-adjust accepts negative delta and rejects non-finite', async () => {
    const { account, token } = await seedAdminAndUser();
    const dec = await supertest(app)
      .post(`/api/admin/accounts/${account.id}/balance-adjust`)
      .set('Authorization', `Bearer ${token}`)
      .send({ delta: -250, reason: 'reversal correction' });
    expect(dec.status).toBe(200);
    expect(dec.body.balance).toBe(750);

    const bad = await supertest(app)
      .post(`/api/admin/accounts/${account.id}/balance-adjust`)
      .set('Authorization', `Bearer ${token}`)
      .send({ delta: 'NaN', reason: 'attack' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('VALIDATION_FAILED');
  });

  it('writeAudit throwing rolls back freeze (D-04 precursor)', async () => {
    const { account, token } = await seedAdminAndUser();
    const original = auditLog.writeAudit;
    auditLog.writeAudit = async () => {
      throw new Error('simulated_audit_failure');
    };
    try {
      const res = await supertest(app)
        .post(`/api/admin/accounts/${account.id}/freeze`)
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBeGreaterThanOrEqual(500);
    } finally {
      auditLog.writeAudit = original;
    }
    const after = await prisma.bankAccount.findUnique({ where: { id: account.id } });
    expect(after.frozen).toBe(false);
    const audits = await prisma.auditLog.findMany();
    expect(audits).toHaveLength(0);
  });
});
