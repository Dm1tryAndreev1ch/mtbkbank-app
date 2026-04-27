/**
 * Phase 4.5 / 04.5-04 / D-09 Plan 4 / D-12 — admin dashboard audit-log widget feed.
 *
 * Read-only GET /api/admin/dashboard/audit:
 *   - paged shape {items, total, page=1, limit=50}, ORDER BY createdAt DESC
 *   - includes actor join (null when admin was hard-deleted)
 *   - LIMIT 50 even when more rows exist
 *   - does NOT call writeAudit (read-only) — endpoint still 200 even if
 *     writeAudit is monkey-patched to throw.
 *   - returns payload AS-IS (writer-side scrubbing already applied).
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

async function seedAdmin() {
  const admin = await prisma.user.create({
    data: { phone: '+79991100001', pin: 'h', name: 'Admin', isAdmin: true },
  });
  const token = jwt.sign(
    { userId: admin.id, isAdmin: true },
    process.env.JWT_SECRET, { expiresIn: '15m' }
  );
  return { admin, token };
}

async function makeAuditRow(prisma, { actorId, action, targetType, targetId, payload, createdAt }) {
  return prisma.auditLog.create({
    data: { actorId, action, targetType, targetId: targetId || null, payload: payload || {}, createdAt },
  });
}

describe('admin dashboard audit widget (D-09 Plan 4)', () => {
  it('GET /dashboard/audit returns paged shape DESC by createdAt with actor join', async () => {
    const { admin, token } = await seedAdmin();
    await makeAuditRow(prisma, {
      actorId: admin.id, action: 'NOTIFICATION_BROADCAST', targetType: 'Notification',
      payload: { after: { recipientCount: 1 } }, createdAt: new Date(Date.now() - 60_000),
    });
    await makeAuditRow(prisma, {
      actorId: admin.id, action: 'BANKCARD_DELETE', targetType: 'BankCard', targetId: 'bc-123',
      payload: { before: { id: 'bc-123' } }, createdAt: new Date(),
    });
    const res = await supertest(app)
      .get('/api/admin/dashboard/audit')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(50);
    expect(res.body.total).toBe(2);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].action).toBe('BANKCARD_DELETE'); // newest first
    expect(res.body.items[0].actor.id).toBe(admin.id);
    expect(res.body.items[0].actor.name).toBe('Admin');
  });

  it('items with null actorId render with actor=null', async () => {
    const { token } = await seedAdmin();
    await makeAuditRow(prisma, {
      actorId: null, action: 'USER_HARD_DELETE', targetType: 'User', targetId: 'u-1',
      payload: { reason: 'compliance' },
    });
    const res = await supertest(app)
      .get('/api/admin/dashboard/audit')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ghost = res.body.items.find((i) => i.action === 'USER_HARD_DELETE');
    expect(ghost).toBeDefined();
    expect(ghost.actor).toBeNull();
  });

  it('returns at most 50 rows when more exist', async () => {
    const { admin, token } = await seedAdmin();
    const base = Date.now();
    const rows = [];
    for (let i = 0; i < 75; i++) {
      rows.push({
        actorId: admin.id,
        action: 'TEST_ACTION',
        targetType: 'User',
        payload: {},
        createdAt: new Date(base - i * 1000),
      });
    }
    await prisma.auditLog.createMany({ data: rows });
    const res = await supertest(app)
      .get('/api/admin/dashboard/audit')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(50);
    expect(res.body.limit).toBe(50);
  });

  it('does NOT call writeAudit (read-only); still 200 if writeAudit monkey-patched to throw', async () => {
    const { admin, token } = await seedAdmin();
    await makeAuditRow(prisma, {
      actorId: admin.id, action: 'ACCOUNT_FREEZE', targetType: 'BankAccount', payload: {},
    });
    const original = auditLog.writeAudit;
    auditLog.writeAudit = async () => { throw new Error('should-not-be-called'); };
    try {
      const res = await supertest(app)
        .get('/api/admin/dashboard/audit')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
    } finally {
      auditLog.writeAudit = original;
    }
  });

  it('returns payload verbatim (writer-side scrubbing already applied)', async () => {
    const { admin, token } = await seedAdmin();
    // Simulate a row that the writer ALREADY scrubbed before insert.
    await makeAuditRow(prisma, {
      actorId: admin.id,
      action: 'USER_UPDATE',
      targetType: 'User',
      targetId: 'u-1',
      payload: { before: { pin: '[REDACTED]', name: 'A' }, after: { pin: '[REDACTED]', name: 'B' } },
    });
    const res = await supertest(app)
      .get('/api/admin/dashboard/audit')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const row = res.body.items[0];
    expect(row.payload.before.pin).toBe('[REDACTED]');
    expect(row.payload.before.name).toBe('A');
    // The endpoint did NOT add or remove any further scrubbing — what the writer
    // wrote is what the reader sees (defence-in-depth at write time).
  });
});
