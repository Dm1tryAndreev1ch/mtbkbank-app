/**
 * Phase 3 — Plan 03-02 — SEC-14, D-01..D-04 integration coverage.
 *
 * AuditLog write-path contract: writeAudit must commit in the same
 * prisma.$transaction as the mutation it audits, scrub forbidden keys,
 * store JSONB before/after payloads, and remain append-only.
 *
 * Three cases are live now (driven directly via prisma.$transaction).
 * Two stay `it.todo` until 03-10 wires the admin-route caller — those
 * cases (rollback-on-throw + append-only via API) only become meaningful
 * once a real mutation exists alongside the writeAudit call.
 */

const supertest = require('supertest');
const { truncateAll, getPrisma } = require('../setup');

let app;
let prisma;

beforeAll(() => {
  jest.resetModules();
  app = require('../../src/index');
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

  it.todo('writeAudit throwing rolls back the mutation (Phase-4.5 dependency, D-03)');

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

  it.todo('AuditLog rows are append-only — no DELETE endpoint exposed (D-04)');
});

// supertest unused while admin-route caller still lives in 03-10
void supertest;
void app;
