/**
 * Phase 3 — Plan 03-02 / 03-10 — SEC-14, D-01..D-04 integration coverage.
 *
 * AuditLog write-path contract: writeAudit must commit in the same
 * prisma.$transaction as the mutation it audits, scrub forbidden keys,
 * store JSONB before/after payloads, and remain append-only.
 *
 * 03-10 flips the rollback + append-only cases to live now that
 * routes/admin.js wires writeAudit(tx, ...) inside prisma.$transaction
 * for every mutation route.
 */

const supertest = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
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

describe('AuditLog (SEC-14, D-01..D-04)', () => {
  it('writeAudit row commits in same prisma.$transaction as mutation (D-03)', async () => {
    const { writeAudit } = require('../../src/services/auditLog');
    const actor = await prisma.user.create({
      data: { phone: '+79991234567', pin: 'h', name: 'Actor', isAdmin: true },
    });
    await prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        actorId: actor.id,
        action: 'TEST_ACTION',
        targetType: 'User',
        targetId: actor.id,
        before: { name: 'A' },
        after: { name: 'B' },
        requestId: 'r-1',
      });
    });
    const rows = await prisma.auditLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('TEST_ACTION');
    expect(rows[0].actorId).toBe(actor.id);
    expect(rows[0].targetType).toBe('User');
    expect(rows[0].requestId).toBe('r-1');
  });

  it('writeAudit throwing rolls back the mutation (Phase-4.5 dependency, D-03)', async () => {
    const target = await prisma.user.create({
      data: { phone: '+79991234560', pin: 'h', name: 'Original' },
    });
    const admin = await prisma.user.create({
      data: { phone: '+79991234561', pin: 'h', name: 'Admin', isAdmin: true },
    });
    const token = jwt.sign(
      { userId: admin.id, isAdmin: true },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    const original = auditLog.writeAudit;
    auditLog.writeAudit = async () => {
      throw new Error('simulated_audit_failure');
    };

    try {
      const res = await supertest(app)
        .put(`/api/admin/users/${target.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Changed' });
      expect(res.status).toBeGreaterThanOrEqual(500);
    } finally {
      auditLog.writeAudit = original;
    }

    const after = await prisma.user.findUnique({ where: { id: target.id } });
    expect(after.name).toBe('Original'); // ROLLED BACK
    const auditRows = await prisma.auditLog.findMany();
    expect(auditRows).toHaveLength(0); // no audit row either
  });

  it('AuditLog.payload is JSONB and stores scrubbed before/after (D-01, D-02)', async () => {
    const { writeAudit } = require('../../src/services/auditLog');
    const actor = await prisma.user.create({
      data: { phone: '+79991234567', pin: 'h', name: 'Actor', isAdmin: true },
    });
    await prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        actorId: actor.id,
        action: 'PII_TEST',
        targetType: 'User',
        targetId: actor.id,
        before: { pin: 'oldpin', name: 'A' },
        after: { pin: 'newpin', name: 'B' },
      });
    });
    const row = await prisma.auditLog.findFirst({ where: { action: 'PII_TEST' } });
    expect(row.payload.before.pin).toBe('[REDACTED]');
    expect(row.payload.before.name).toBe('A');
    expect(row.payload.after.pin).toBe('[REDACTED]');
    expect(row.payload.after.name).toBe('B');
  });

  it('forbidden keys (pin, password, cardNumber, Authorization, refreshToken, cookie) are [REDACTED] (D-02)', async () => {
    const { writeAudit } = require('../../src/services/auditLog');
    const actor = await prisma.user.create({
      data: { phone: '+79991234567', pin: 'h', name: 'Actor', isAdmin: true },
    });
    await prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        actorId: actor.id,
        action: 'FORBIDDEN_KEYS',
        targetType: 'User',
        after: {
          pin: 'p',
          password: 'q',
          cardNumber: '4111',
          Authorization: 'Bearer',
          refreshToken: 'r',
          cookie: 'c',
          ok: 'visible',
        },
      });
    });
    const row = await prisma.auditLog.findFirst({ where: { action: 'FORBIDDEN_KEYS' } });
    ['pin', 'password', 'cardNumber', 'Authorization', 'refreshToken', 'cookie'].forEach((k) => {
      expect(row.payload.after[k]).toBe('[REDACTED]');
    });
    expect(row.payload.after.ok).toBe('visible');
  });

  it('AuditLog rows are append-only — no DELETE endpoint exposed (D-04)', async () => {
    const admin = await prisma.user.create({
      data: {
        phone: '+79991234562',
        pin: await bcrypt.hash('1234', 4),
        name: 'Admin',
        isAdmin: true,
      },
    });
    const token = jwt.sign(
      { userId: admin.id, isAdmin: true },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    // Create an audit row via a real admin mutation.
    const create = await supertest(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '+79990000111', pin: '1234', name: 'New' });
    expect(create.status).toBeLessThan(500);

    const rows = await prisma.auditLog.findMany();
    expect(rows.length).toBeGreaterThanOrEqual(1);

    // No DELETE endpoint exists for audit-log — Express returns 404.
    const res = await supertest(app)
      .delete(`/api/admin/audit-log/${rows[0].id}`)
      .set('Authorization', `Bearer ${token}`);
    expect([404, 405]).toContain(res.status);
  });
});
