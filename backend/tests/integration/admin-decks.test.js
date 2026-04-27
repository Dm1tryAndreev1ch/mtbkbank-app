/**
 * Phase 4.5 / 04.5-03 / ADMIN-05 — admin Deck endpoints integration test.
 *
 * Covers:
 *   GET  /api/admin/decks/by-user/:userId   list user decks
 *   POST /api/admin/decks/:id/break-active  isActive=false + audit
 *   rollback test on break-active.
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
    data: { phone: '+79991234561', pin: 'h', name: 'Admin', isAdmin: true },
  });
  const target = await prisma.user.create({
    data: { phone: '+79991234562', pin: 'h', name: 'Target' },
  });
  const deckActive = await prisma.deck.create({
    data: { userId: target.id, name: 'Active', isActive: true },
  });
  const deckInactive = await prisma.deck.create({
    data: { userId: target.id, name: 'Inactive', isActive: false },
  });
  const token = jwt.sign(
    { userId: admin.id, isAdmin: true },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
  return { admin, target, deckActive, deckInactive, token };
}

describe('admin decks (ADMIN-05, Phase-4.5 04.5-03)', () => {
  it('GET /api/admin/decks/by-user/:userId returns the user\'s decks', async () => {
    const { token, target } = await seed();
    const res = await supertest(app)
      .get(`/api/admin/decks/by-user/${target.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBe(2);
    // Each deck has a _count for deckCards.
    expect(res.body.items[0]._count).toBeDefined();
  });

  it('POST /:id/break-active sets isActive=false with DECK_BREAK_ACTIVE audit', async () => {
    const { admin, deckActive, token } = await seed();
    const res = await supertest(app)
      .post(`/api/admin/decks/${deckActive.id}/break-active`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'admin reset' });
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);
    const after = await prisma.deck.findUnique({ where: { id: deckActive.id } });
    expect(after.isActive).toBe(false);
    const audits = await prisma.auditLog.findMany({ where: { action: 'DECK_BREAK_ACTIVE' } });
    expect(audits).toHaveLength(1);
    expect(audits[0].actorId).toBe(admin.id);
    expect(audits[0].targetType).toBe('Deck');
    expect(audits[0].targetId).toBe(deckActive.id);
    expect(audits[0].payload.before.isActive).toBe(true);
    expect(audits[0].payload.after.isActive).toBe(false);
    expect(audits[0].payload.reason).toBe('admin reset');
  });

  it('writeAudit throwing rolls back break-active', async () => {
    const { deckActive, token } = await seed();
    const original = auditLog.writeAudit;
    auditLog.writeAudit = async () => { throw new Error('simulated_audit_failure'); };
    try {
      const res = await supertest(app)
        .post(`/api/admin/decks/${deckActive.id}/break-active`)
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBeGreaterThanOrEqual(500);
    } finally {
      auditLog.writeAudit = original;
    }
    const after = await prisma.deck.findUnique({ where: { id: deckActive.id } });
    expect(after.isActive).toBe(true);
    const audits = await prisma.auditLog.findMany();
    expect(audits).toHaveLength(0);
  });

  it('break-active is idempotent (404 on missing id)', async () => {
    const { token } = await seed();
    const res = await supertest(app)
      .post('/api/admin/decks/nonexistent_id/break-active')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(404);
  });
});
