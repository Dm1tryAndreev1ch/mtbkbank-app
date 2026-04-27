/**
 * Phase 4.5 / 04.5-02 / ADMIN-08 — admin payments status override.
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

async function seedPayment() {
  const admin = await prisma.user.create({
    data: { phone: '+79991234561', pin: 'h', name: 'Admin', isAdmin: true },
  });
  const user = await prisma.user.create({
    data: { phone: '+79991234562', pin: 'h', name: 'User' },
  });
  const acc = await prisma.bankAccount.create({
    data: { userId: user.id, name: 'A', type: 'main', balance: 1000 },
  });
  const payment = await prisma.transaction.create({
    data: {
      userId: user.id, fromAccountId: acc.id, amount: 100,
      type: 'PAYMENT', status: 'pending',
    },
  });
  const token = jwt.sign(
    { userId: admin.id, isAdmin: true },
    process.env.JWT_SECRET, { expiresIn: '15m' }
  );
  return { admin, user, payment, token };
}

describe('admin payments (ADMIN-08)', () => {
  it('GET /api/admin/payments returns paged shape, type=PAYMENT only', async () => {
    const { token, user } = await seedPayment();
    // Add a non-payment tx to confirm filtering.
    await prisma.transaction.create({
      data: { userId: user.id, amount: 1, type: 'PURCHASE', status: 'completed' },
    });
    const res = await supertest(app)
      .get('/api/admin/payments?page=1&limit=50')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items.every((p) => p.type === 'PAYMENT')).toBe(true);
    expect(res.body.total).toBe(1);
  });

  it('POST /:id/status overrides status and writes audit', async () => {
    const { admin, payment, token } = await seedPayment();
    const res = await supertest(app)
      .post(`/api/admin/payments/${payment.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'completed', reason: 'manual confirmation' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    const audits = await prisma.auditLog.findMany({ where: { action: 'PAYMENT_STATUS_OVERRIDE' } });
    expect(audits).toHaveLength(1);
    expect(audits[0].actorId).toBe(admin.id);
    expect(audits[0].targetType).toBe('Transaction');
    expect(audits[0].payload.before.status).toBe('pending');
    expect(audits[0].payload.after.status).toBe('completed');
    expect(audits[0].payload.reason).toBe('manual confirmation');
  });

  it('writeAudit-throw rolls back the status override', async () => {
    const { payment, token } = await seedPayment();
    const original = auditLog.writeAudit;
    auditLog.writeAudit = async () => { throw new Error('simulated_audit_failure'); };
    try {
      const res = await supertest(app)
        .post(`/api/admin/payments/${payment.id}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'failed', reason: 'rollback test' });
      expect(res.status).toBeGreaterThanOrEqual(500);
    } finally {
      auditLog.writeAudit = original;
    }
    const after = await prisma.transaction.findUnique({ where: { id: payment.id } });
    expect(after.status).toBe('pending');
  });
});
