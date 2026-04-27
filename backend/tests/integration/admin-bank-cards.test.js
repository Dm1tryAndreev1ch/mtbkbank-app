/**
 * Phase 4.5 / 04.5-03 / ADMIN-03 — admin BankCard endpoints integration test.
 *
 * Covers:
 *   GET    /api/admin/bankCards              paged list
 *   POST   /api/admin/bankCards              force-issue + cross-check
 *   POST   /api/admin/bankCards/:id/block    isActive=false + audit
 *   POST   /api/admin/bankCards/:id/unblock  isActive=true  + audit
 *   DELETE /api/admin/bankCards/:id          hard delete    + audit
 *   rollback: writeAudit throwing rolls back the block.
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

async function seedAdminUserCard() {
  const admin = await prisma.user.create({
    data: { phone: '+79991234561', pin: 'h', name: 'Admin', isAdmin: true },
  });
  const target = await prisma.user.create({
    data: { phone: '+79991234562', pin: 'h', name: 'Target' },
  });
  const account = await prisma.bankAccount.create({
    data: { userId: target.id, name: 'Основной', type: 'main', balance: 1000 },
  });
  const card = await prisma.bankCard.create({
    data: {
      userId: target.id,
      accountId: account.id,
      maskedNumber: '**** 1234',
      type: 'debit',
      tier: 'standard',
      isActive: true,
    },
  });
  const token = jwt.sign(
    { userId: admin.id, isAdmin: true },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
  return { admin, target, account, card, token };
}

describe('admin bankCards (ADMIN-03, Phase-4.5 04.5-03)', () => {
  it('GET /api/admin/bankCards returns { items, total, page, limit }', async () => {
    const { token, target } = await seedAdminUserCard();
    const res = await supertest(app)
      .get(`/api/admin/bankCards?userId=${target.id}&page=1&limit=50`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page', 1);
    expect(res.body).toHaveProperty('limit', 50);
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  it('POST /:id/block sets isActive=false with BANKCARD_BLOCK audit', async () => {
    const { admin, card, token } = await seedAdminUserCard();
    const res = await supertest(app)
      .post(`/api/admin/bankCards/${card.id}/block`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'fraud' });
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);
    const after = await prisma.bankCard.findUnique({ where: { id: card.id } });
    expect(after.isActive).toBe(false);
    const audits = await prisma.auditLog.findMany({ where: { action: 'BANKCARD_BLOCK' } });
    expect(audits).toHaveLength(1);
    expect(audits[0].actorId).toBe(admin.id);
    expect(audits[0].targetType).toBe('BankCard');
    expect(audits[0].targetId).toBe(card.id);
    expect(audits[0].payload.before.isActive).toBe(true);
    expect(audits[0].payload.after.isActive).toBe(false);
    expect(audits[0].payload.reason).toBe('fraud');
  });

  it('POST /:id/unblock restores isActive=true with BANKCARD_UNBLOCK audit', async () => {
    const { card, token } = await seedAdminUserCard();
    await supertest(app)
      .post(`/api/admin/bankCards/${card.id}/block`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    const res = await supertest(app)
      .post(`/api/admin/bankCards/${card.id}/unblock`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(true);
    const audits = await prisma.auditLog.findMany({ where: { action: 'BANKCARD_UNBLOCK' } });
    expect(audits).toHaveLength(1);
    expect(audits[0].payload.before.isActive).toBe(false);
    expect(audits[0].payload.after.isActive).toBe(true);
  });

  it('POST /api/admin/bankCards force-issues a new card with BANKCARD_ISSUE audit', async () => {
    const { token, target, account } = await seedAdminUserCard();
    const res = await supertest(app)
      .post('/api/admin/bankCards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        userId: target.id,
        accountId: account.id,
        type: 'credit',
        tier: 'platinum',
        maskedNumber: '**** 9999',
      });
    expect(res.status).toBe(200);
    expect(res.body.id).toBeTruthy();
    expect(res.body.type).toBe('credit');
    expect(res.body.maskedNumber).toBe('**** 9999');
    const audits = await prisma.auditLog.findMany({ where: { action: 'BANKCARD_ISSUE' } });
    expect(audits).toHaveLength(1);
    expect(audits[0].payload.after.id).toBe(res.body.id);
  });

  it('POST force-issue rejects accountId belonging to a different user (T-04.5-03-04)', async () => {
    const { token, account } = await seedAdminUserCard();
    const stranger = await prisma.user.create({
      data: { phone: '+79991234599', pin: 'h', name: 'Stranger' },
    });
    const res = await supertest(app)
      .post('/api/admin/bankCards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        userId: stranger.id,
        accountId: account.id, // belongs to `target`, not stranger
        type: 'debit',
        tier: 'standard',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_FAILED');
    const audits = await prisma.auditLog.findMany({ where: { action: 'BANKCARD_ISSUE' } });
    expect(audits).toHaveLength(0);
  });

  it('DELETE /:id hard deletes BankCard with BANKCARD_DELETE audit', async () => {
    const { card, token } = await seedAdminUserCard();
    const res = await supertest(app)
      .delete(`/api/admin/bankCards/${card.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const after = await prisma.bankCard.findUnique({ where: { id: card.id } });
    expect(after).toBeNull();
    const audits = await prisma.auditLog.findMany({ where: { action: 'BANKCARD_DELETE' } });
    expect(audits).toHaveLength(1);
    expect(audits[0].payload.before.id).toBe(card.id);
  });

  it('writeAudit throwing rolls back block', async () => {
    const { card, token } = await seedAdminUserCard();
    const original = auditLog.writeAudit;
    auditLog.writeAudit = async () => { throw new Error('simulated_audit_failure'); };
    try {
      const res = await supertest(app)
        .post(`/api/admin/bankCards/${card.id}/block`)
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBeGreaterThanOrEqual(500);
    } finally {
      auditLog.writeAudit = original;
    }
    const after = await prisma.bankCard.findUnique({ where: { id: card.id } });
    expect(after.isActive).toBe(true);
    const audits = await prisma.auditLog.findMany();
    expect(audits).toHaveLength(0);
  });
});
