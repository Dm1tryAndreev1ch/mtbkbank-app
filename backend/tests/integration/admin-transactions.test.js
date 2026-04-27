/**
 * Phase 4.5 / 04.5-02 / ADMIN-02 — admin transactions integration test.
 *
 * Covers:
 *   GET    /api/admin/transactions          paged search shape
 *   POST   /api/admin/transactions/:id/reverse:
 *     - on COMPLETED tx → creates compensator, sets reversedById,
 *       writes AuditLog TRANSACTION_REVERSE row inside same tx.
 *     - on already-reversed tx → 409 TRANSACTION_ALREADY_REVERSED.
 *     - on PENDING tx          → 409 TRANSACTION_NOT_REVERSIBLE.
 *     - writeAudit-throw       → rolls back; reversedById stays null.
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

async function seedAdminTwoAccountsAndCompletedTx() {
  const admin = await prisma.user.create({
    data: { phone: '+79991234561', pin: 'h', name: 'Admin', isAdmin: true },
  });
  const u1 = await prisma.user.create({
    data: { phone: '+79991234562', pin: 'h', name: 'User1' },
  });
  const u2 = await prisma.user.create({
    data: { phone: '+79991234563', pin: 'h', name: 'User2' },
  });
  const a1 = await prisma.bankAccount.create({
    data: { userId: u1.id, name: 'A1', type: 'main', balance: 5000 },
  });
  const a2 = await prisma.bankAccount.create({
    data: { userId: u2.id, name: 'A2', type: 'main', balance: 1000 },
  });
  const tx = await prisma.transaction.create({
    data: {
      userId: u1.id,
      fromAccountId: a1.id,
      toAccountId: a2.id,
      amount: 200,
      type: 'TRANSFER_OUT',
      status: 'completed',
    },
  });
  const token = jwt.sign(
    { userId: admin.id, isAdmin: true },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
  return { admin, u1, u2, a1, a2, tx, token };
}

describe('admin transactions reverse (ADMIN-02)', () => {
  it('GET /api/admin/transactions returns { items, total, page, limit }', async () => {
    const { token } = await seedAdminTwoAccountsAndCompletedTx();
    const res = await supertest(app)
      .get('/api/admin/transactions?page=1&limit=50')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(50);
  });

  it('POST /:id/reverse on COMPLETED tx creates compensator + sets reversedById + audit', async () => {
    const { admin, tx, a1, a2, token } = await seedAdminTwoAccountsAndCompletedTx();
    const res = await supertest(app)
      .post(`/api/admin/transactions/${tx.id}/reverse`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'fraud reversal' });
    expect(res.status).toBe(200);
    expect(res.body.compensating).toBeTruthy();
    expect(res.body.original.reversedById).toBe(res.body.compensating.id);
    expect(res.body.original.status).toBe('reversed');

    // Balances unwound: a1 was debited 200; compensator credits a1 back.
    const a1After = await prisma.bankAccount.findUnique({ where: { id: a1.id } });
    const a2After = await prisma.bankAccount.findUnique({ where: { id: a2.id } });
    expect(a1After.balance).toBe(5000 + 200);
    expect(a2After.balance).toBe(1000 - 200);

    const audits = await prisma.auditLog.findMany({ where: { action: 'TRANSACTION_REVERSE' } });
    expect(audits).toHaveLength(1);
    expect(audits[0].actorId).toBe(admin.id);
    expect(audits[0].targetId).toBe(tx.id);
    expect(audits[0].payload.reason).toBe('fraud reversal');
    expect(audits[0].payload.before.status).toBe('completed');
    expect(audits[0].payload.after.status).toBe('reversed');
  });

  it('POST /:id/reverse on already-reversed tx returns 409 TRANSACTION_ALREADY_REVERSED', async () => {
    const { tx, token } = await seedAdminTwoAccountsAndCompletedTx();
    const ok = await supertest(app)
      .post(`/api/admin/transactions/${tx.id}/reverse`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'first reversal' });
    expect(ok.status).toBe(200);

    const dup = await supertest(app)
      .post(`/api/admin/transactions/${tx.id}/reverse`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'second attempt' });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('TRANSACTION_ALREADY_REVERSED');
  });

  it('POST /:id/reverse on PENDING tx returns 409 TRANSACTION_NOT_REVERSIBLE', async () => {
    const { token, u1, a1 } = await seedAdminTwoAccountsAndCompletedTx();
    const pending = await prisma.transaction.create({
      data: {
        userId: u1.id, fromAccountId: a1.id, amount: 50,
        type: 'PAYMENT', status: 'pending',
      },
    });
    const res = await supertest(app)
      .post(`/api/admin/transactions/${pending.id}/reverse`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'attempt' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('TRANSACTION_NOT_REVERSIBLE');
  });

  it('writeAudit throwing rolls back the reverse (D-04 precursor)', async () => {
    const { tx, token } = await seedAdminTwoAccountsAndCompletedTx();
    const original = auditLog.writeAudit;
    auditLog.writeAudit = async () => { throw new Error('simulated_audit_failure'); };
    try {
      const res = await supertest(app)
        .post(`/api/admin/transactions/${tx.id}/reverse`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'rollback test' });
      expect(res.status).toBeGreaterThanOrEqual(500);
    } finally {
      auditLog.writeAudit = original;
    }
    const after = await prisma.transaction.findUnique({ where: { id: tx.id } });
    expect(after.reversedById).toBeNull();
    expect(after.status).toBe('completed');
    const compensators = await prisma.transaction.count({ where: { description: { contains: 'Компенсирующая' } } });
    expect(compensators).toBe(0);
    const audits = await prisma.auditLog.findMany({ where: { action: 'TRANSACTION_REVERSE' } });
    expect(audits).toHaveLength(0);
  });
});
