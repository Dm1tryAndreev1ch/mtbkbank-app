/**
 * Phase 3 — Plan 03-12 — SEC-09 live tests.
 *
 * /api/users/search: q.length >= 10, no phone field in response, paginated.
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

describe('user-search validation (SEC-09)', () => {
  it('GET /api/users/search?q=short returns 400 VALIDATION_FAILED (q.length < 10)', async () => {
    const u = await prisma.user.create({
      data: { phone: '+79991111140', pin: 'h', name: 'A' },
    });
    const token = jwt.sign(
      { userId: u.id, isAdmin: false },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    const res = await supertest(app)
      .get('/api/users/search?q=short')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_FAILED');
  });

  it('response payload contains no phone field for any matched user', async () => {
    const me = await prisma.user.create({
      data: { phone: '+79991111141', pin: 'h', name: 'Me' },
    });
    await prisma.user.create({
      data: { phone: '+79991111142', pin: 'h', name: 'Длинноеимядва' },
    });
    await prisma.user.create({
      data: { phone: '+79991111143', pin: 'h', name: 'Длинноеимятри' },
    });
    const token = jwt.sign(
      { userId: me.id, isAdmin: false },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    const res = await supertest(app)
      .get(`/api/users/search?q=${encodeURIComponent('Длинноеимя')}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    for (const item of res.body.items) {
      expect(item.phone).toBeUndefined();
    }
  });

  it('paginated via ?page=&limit=; default limit ≤ 50', async () => {
    const me = await prisma.user.create({
      data: { phone: '+79991111150', pin: 'h', name: 'Searcher' },
    });
    for (let i = 0; i < 25; i++) {
      const padded = String(1000 + i);
      await prisma.user.create({
        data: {
          phone: `+7999000${padded}`,
          pin: 'h',
          name: `UserMatchable${padded}`,
        },
      });
    }
    const token = jwt.sign(
      { userId: me.id, isAdmin: false },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    const res = await supertest(app)
      .get('/api/users/search?q=UserMatchable&limit=10')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeLessThanOrEqual(10);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('limit');
    expect(res.body.limit).toBe(10);
  });
});
