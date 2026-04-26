/**
 * Phase 4 / 04-02 / B-M1 — verification-only test pinning the Redis-backed
 * loginLimiter (5 attempts / 15min, keyGenerator on req.ip /64) wired in
 * Phase 3 / 03-07.
 *
 * Sixth POST /api/auth/login from the same IP within the window returns 429
 * with the contract body { error: 'RATE_LIMIT_EXCEEDED' }.
 *
 * truncateAll() flushes `rl:login:*` per setup.js so the test starts cold.
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

describe('B-M1 — POST /api/auth/login rate limit (Redis-backed)', () => {
  test('6th attempt within window returns 429 RATE_LIMIT_EXCEEDED', async () => {
    // Use bogus credentials — we only care about the limiter status code,
    // not whether auth succeeds. Each attempt costs the same bcrypt budget
    // thanks to the dummy-hash branch (D-12 timing parity), so the loop is
    // bounded by REFRESH_TTL window, not test runtime.
    const body = { phone: '+79990000000', pin: '0000' };

    let lastStatus = 0;
    for (let i = 0; i < 5; i++) {
      const res = await supertest(app).post('/api/auth/login').send(body);
      lastStatus = res.status;
      // First 5 should be 401 (invalid credentials) — definitely NOT 429.
      expect(res.status).not.toBe(429);
    }
    expect(lastStatus).toBe(401);

    const sixth = await supertest(app).post('/api/auth/login').send(body);
    expect(sixth.status).toBe(429);
    expect(sixth.body.error).toBe('RATE_LIMIT_EXCEEDED');
  });
});
