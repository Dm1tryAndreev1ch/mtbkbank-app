/**
 * Phase 4 / 04-02 / B-M2 — POST /auth/refresh rejects DB-expired refresh tokens.
 *
 * Even when the JWT signature still verifies (REFRESH_TTL is 30d), if the
 * server-side `refreshTokenExpiresAt` is in the past the route returns 401 with
 * code REFRESH_TOKEN_EXPIRED so the mobile client can redirect to login.
 *
 * Happy path: a fresh (non-expired) token rotates and returns new tokens.
 */

const supertest = require('supertest');
const bcrypt = require('bcryptjs');
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

const VALID_TEST_PAN = '4111111111111111';

async function registerAndGetTokens() {
  const res = await supertest(app)
    .post('/api/auth/register')
    .send({
      firstName: 'Test',
      lastName: 'User',
      phone: '+79991234567',
      pin: '1234',
      cardNumber: VALID_TEST_PAN,
    });
  expect(res.status).toBe(201);
  return { refreshToken: res.body.refreshToken, accessToken: res.body.accessToken };
}

describe('B-M2 — POST /api/auth/refresh expiration', () => {
  test('rejects refresh when refreshTokenExpiresAt < now with REFRESH_TOKEN_EXPIRED', async () => {
    const { refreshToken } = await registerAndGetTokens();

    // Backdate the DB stamp to the past — JWT itself is still valid.
    await prisma.user.update({
      where: { phone: '+79991234567' },
      data: { refreshTokenExpiresAt: new Date(Date.now() - 60_000) },
    });

    const res = await supertest(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('REFRESH_TOKEN_EXPIRED');
  });

  test('happy path: non-expired token rotates successfully', async () => {
    const { refreshToken } = await registerAndGetTokens();

    const res = await supertest(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
    // Rotation: DB now stores the new token. JWT iat is per-second so the new
    // string may be byte-identical when the test executes within a single
    // second; verify rotation via the persisted column instead.
    const after = await prisma.user.findUnique({
      where: { phone: '+79991234567' },
      select: { refreshToken: true },
    });
    expect(after.refreshToken).toBe(res.body.refreshToken);

    // The new stamp is in the future.
    const updated = await prisma.user.findUnique({
      where: { phone: '+79991234567' },
      select: { refreshTokenExpiresAt: true },
    });
    expect(updated.refreshTokenExpiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});
