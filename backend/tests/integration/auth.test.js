/**
 * Phase 2 — Plan 02-11 — Task 1
 *
 * TEST-02 + D-13: supertest coverage of /api/auth/login, /api/auth/register,
 * /api/auth/refresh including the rotation single-use assertion (D-13).
 *
 * Boots the real Express app via `require('../../src/index')` — Phase-1 plan 03
 * gated `app.listen` behind `require.main === module` precisely so this works
 * without the listener fighting for env.PORT.
 *
 * DB isolation: `truncateAll()` from `../setup` runs in beforeEach (D-23).
 *
 * Error contract note: the auth routes respond with `{ error: '<russian>' }`
 * (NOT `{ message }`); all assertions match `res.body.error`.
 *
 * Register handler requires firstName + lastName + Luhn-valid cardNumber +
 * phone + 4-digit pin (see backend/src/routes/auth.js registerHandler).
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

async function seedUser({ phone = '+79991234567', pin = '1234', name = 'Test User' } = {}) {
  const pinHash = await bcrypt.hash(pin, 10);
  return prisma.user.create({
    data: { phone, pin: pinHash, name, isAdmin: false, status: 'STANDARD' },
  });
}

// Luhn-valid test PAN (4111 1111 1111 1111 — classic Visa test number).
const VALID_TEST_PAN = '4111111111111111';

describe('POST /api/auth/login', () => {
  test('happy path: returns 200 + accessToken + refreshToken + user', async () => {
    await seedUser({ phone: '+79991234567', pin: '1234' });
    const res = await supertest(app)
      .post('/api/auth/login')
      .send({ phone: '+79991234567', pin: '1234' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(res.body.user).toBeDefined();
    expect(res.body.user.phone).toBe('+79991234567');
  });

  test('bad PIN: returns 401 + Russian error «Неверный телефон или PIN»', async () => {
    await seedUser({ phone: '+79991234567', pin: '1234' });
    const res = await supertest(app)
      .post('/api/auth/login')
      .send({ phone: '+79991234567', pin: '9999' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Неверный/);
  });

  test('unknown phone: returns 401 + Russian error', async () => {
    const res = await supertest(app)
      .post('/api/auth/login')
      .send({ phone: '+70000000000', pin: '1234' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Неверный/);
  });

  test('missing fields: returns 400 + Russian error', async () => {
    const res = await supertest(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Укажите/);
  });
});

describe('POST /api/auth/register', () => {
  test('happy path: returns 201 + accessToken + refreshToken + user', async () => {
    const res = await supertest(app)
      .post('/api/auth/register')
      .send({
        firstName: 'New',
        lastName: 'User',
        phone: '+79992223344',
        pin: '1111',
        cardNumber: VALID_TEST_PAN,
      });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(res.body.user.phone).toBe('+79992223344');
  });

  test('duplicate phone: returns 409 + Russian error', async () => {
    await seedUser({ phone: '+79992223344' });
    const res = await supertest(app)
      .post('/api/auth/register')
      .send({
        firstName: 'Dup',
        lastName: 'User',
        phone: '+79992223344',
        pin: '1111',
        cardNumber: VALID_TEST_PAN,
      });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/уже/);
  });

  test('invalid card number (Luhn fail): returns 400', async () => {
    const res = await supertest(app)
      .post('/api/auth/register')
      .send({
        firstName: 'Bad',
        lastName: 'Card',
        phone: '+79993334455',
        pin: '1111',
        cardNumber: '1234567890123456',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/карты/i);
  });
});

describe('POST /api/auth/refresh', () => {
  // signRefresh() uses jwt.sign with `expiresIn: '30d'` — JWTs signed in the same
  // wall-clock second produce IDENTICAL strings (same payload + same iat). To
  // exercise rotation in tests we sleep >=1100ms between issuance points so the
  // iat claim differs and the rotated token is byte-distinct from the original.
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  async function loginAndGetTokens(phone = '+79993334455', pin = '1234') {
    await seedUser({ phone, pin });
    const res = await supertest(app)
      .post('/api/auth/login')
      .send({ phone, pin });
    expect(res.status).toBe(200);
    return { accessToken: res.body.accessToken, refreshToken: res.body.refreshToken };
  }

  test('happy path: returns 200 + NEW accessToken + NEW refreshToken (rotation)', async () => {
    const { refreshToken } = await loginAndGetTokens();
    await sleep(1100); // ensure iat-claim differs so rotated token is byte-distinct
    const res = await supertest(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).not.toBe(refreshToken);
  });

  test('invalid token: returns 401', async () => {
    const res = await supertest(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'invalid-jwt' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Недействительный/);
  });

  test('missing token: returns 400', async () => {
    const res = await supertest(app).post('/api/auth/refresh').send({});
    expect(res.status).toBe(400);
  });

  test('D-13 rotation single-use: re-using OLD refreshToken after rotation returns 401', async () => {
    const { refreshToken: oldRefresh } = await loginAndGetTokens();
    await sleep(1100); // iat must differ so the rotated token is byte-distinct from oldRefresh
    // First refresh — succeeds and rotates the stored token.
    const ok = await supertest(app).post('/api/auth/refresh').send({ refreshToken: oldRefresh });
    expect(ok.status).toBe(200);
    expect(ok.body.refreshToken).not.toBe(oldRefresh);
    // Re-use the OLD refresh — must fail (D-13: single-use rotation).
    const reuse = await supertest(app).post('/api/auth/refresh').send({ refreshToken: oldRefresh });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error).toMatch(/Недействительный/);
  });
});
