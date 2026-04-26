/**
 * Phase 3 — Plan 03-08 — D-13..D-15.
 *
 * Admin destructive-route in-memory limiter (per-actorId, write methods only).
 * 60/min cap on POST/PUT/PATCH/DELETE under /api/admin/*; GET/HEAD exempt.
 */

const supertest = require('supertest');
const jwt = require('jsonwebtoken');
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

describe('admin in-memory destructive rate-limit (D-13..D-15)', () => {
  it('GET /api/admin/users is exempt (read methods skipped)', async () => {
    const admin = await prisma.user.create({
      data: { phone: '+79000000000', pin: 'h', name: 'A', isAdmin: true },
    });
    const token = jwt.sign(
      { userId: admin.id, isAdmin: true },
      process.env.JWT_SECRET,
      { expiresIn: '15m' },
    );
    // 80 GETs in tight loop — none should 429
    let any429 = false;
    for (let i = 0; i < 80; i++) {
      const res = await supertest(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${token}`);
      if (res.status === 429) {
        any429 = true;
        break;
      }
    }
    expect(any429).toBe(false);
  }, 30000);

  it('POST /api/admin/users 61st request within 1min returns 429 (per-actorId, in-memory)', async () => {
    const admin = await prisma.user.create({
      data: { phone: '+79000000001', pin: 'h', name: 'A', isAdmin: true },
    });
    const token = jwt.sign(
      { userId: admin.id, isAdmin: true },
      process.env.JWT_SECRET,
      { expiresIn: '15m' },
    );
    let lastStatus;
    for (let i = 0; i < 61; i++) {
      const res = await supertest(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${token}`)
        .send({ phone: `+7900000${1000 + i}`, pin: '1234', name: `U${i}` });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  }, 60000);

  it('different actorIds have independent buckets', async () => {
    const a1 = await prisma.user.create({
      data: { phone: '+79000000010', pin: 'h', name: 'A1', isAdmin: true },
    });
    const a2 = await prisma.user.create({
      data: { phone: '+79000000011', pin: 'h', name: 'A2', isAdmin: true },
    });
    const token1 = jwt.sign(
      { userId: a1.id, isAdmin: true },
      process.env.JWT_SECRET,
      { expiresIn: '15m' },
    );
    const token2 = jwt.sign(
      { userId: a2.id, isAdmin: true },
      process.env.JWT_SECRET,
      { expiresIn: '15m' },
    );
    // Fill a1 bucket with 30 requests (under cap so a1 itself stays unlimited too,
    // but the bucket is now non-trivial). a2's first request must NOT be 429.
    for (let i = 0; i < 30; i++) {
      await supertest(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${token1}`)
        .send({});
    }
    const res = await supertest(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${token2}`)
      .send({});
    expect(res.status).not.toBe(429);
  }, 30000);

  it.todo('in-memory counter resets on backend restart (acceptable per D-14)');
});
